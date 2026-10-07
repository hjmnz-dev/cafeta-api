import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import type { ActorContext } from '../../common/actor/actor-context.js';
import { AuditService } from '../../common/audit/audit.service.js';
import { ACTIVE } from '../../common/soft-delete/soft-delete.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { MediaUrlService } from '../uploads/media-url.service.js';
import { canSeeContent } from '../visibility/visibility-rules.js';
import { VisibilityService } from '../visibility/visibility.service.js';
import { PageQueryDto } from '../posts/dto/page-query.dto.js';
import type {
  FollowRequestPageDto,
  FollowStatusViewDto,
  FollowUserPageDto,
} from './dto/follow-view.dto.js';
import {
  afterFollowCursor,
  FOLLOW_ORDER,
  toFollowRequestPage,
  toFollowUserPage,
  USER_CARD_SELECT,
} from './follow-queries.js';

type FollowWriter = Pick<Prisma.TransactionClient, 'follow'>;

export interface FollowCounts {
  followers: number;
  following: number;
}

export interface AcceptedFollow {
  id: string;
  followerId: string;
}

@Injectable()
export class FollowsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly visibility: VisibilityService,
    private readonly urls: MediaUrlService,
    private readonly notifications: NotificationsService,
  ) {}

  // Seguidores y seguidos con seguimiento aceptado, activo y de cuentas activas.
  async counts(userId: string): Promise<FollowCounts> {
    const [followers, following] = await Promise.all([
      this.prisma.follow.count({
        where: {
          followingId: userId,
          status: 'ACCEPTED',
          deactivatedAt: null,
          follower: ACTIVE,
        },
      }),
      this.prisma.follow.count({
        where: {
          followerId: userId,
          status: 'ACCEPTED',
          deactivatedAt: null,
          following: ACTIVE,
        },
      }),
    ]);
    return { followers, following };
  }

  // Seguir a un usuario: crea el seguimiento o reactiva el anterior.
  // Público -> ACCEPTED directo; Solo seguidores -> PENDING; Privado -> prohibido.
  async follow(
    targetUserId: string,
    currentUserId: string,
    actor: ActorContext,
  ): Promise<FollowStatusViewDto> {
    if (targetUserId === currentUserId) {
      throw new BadRequestException({
        message: 'No puedes seguirte a ti mismo',
        code: 'CANNOT_FOLLOW_SELF',
      });
    }

    const target = await this.prisma.user.findFirst({
      where: { id: targetUserId, ...ACTIVE },
      select: {
        id: true,
        profile: { select: { visibility: true } },
        blocksMade: {
          where: { blockedId: currentUserId, ...ACTIVE },
          select: { id: true },
        },
        blocksReceived: {
          where: { blockerId: currentUserId, ...ACTIVE },
          select: { id: true },
        },
      },
    });

    if (!target || !target.profile) {
      throw new NotFoundException({
        message: 'El usuario no existe',
        code: 'USER_NOT_FOUND',
      });
    }

    if (target.blocksMade.length > 0 || target.blocksReceived.length > 0) {
      throw new NotFoundException({
        message: 'El usuario no existe',
        code: 'USER_NOT_FOUND',
      });
    }

    if (target.profile.visibility === 'PRIVATE') {
      throw new ForbiddenException({
        message: 'Esta cuenta es privada y no admite seguidores',
        code: 'PROFILE_PRIVATE',
      });
    }

    const nextStatus: 'ACCEPTED' | 'PENDING' =
      target.profile.visibility === 'PUBLIC' ? 'ACCEPTED' : 'PENDING';

    const existing = await this.prisma.follow.findUnique({
      where: {
        followerId_followingId: {
          followerId: currentUserId,
          followingId: targetUserId,
        },
      },
    });

    if (existing && existing.deactivatedAt === null) {
      return { id: existing.id, status: existing.status };
    }

    const followRecord = await this.prisma.$transaction(async (tx) => {
      const now = new Date();
      let record;
      if (existing) {
        record = await tx.follow.update({
          where: { id: existing.id },
          data: {
            status: nextStatus,
            deactivatedAt: null,
            respondedAt: nextStatus === 'ACCEPTED' ? now : null,
          },
        });
      } else {
        record = await tx.follow.create({
          data: {
            followerId: currentUserId,
            followingId: targetUserId,
            status: nextStatus,
            respondedAt: nextStatus === 'ACCEPTED' ? now : null,
          },
        });
      }

      await this.audit.record(tx, {
        action: 'follow.create',
        entityType: 'follow',
        entityId: record.id,
        actor,
        succeeded: true,
        metadata: { targetUserId, status: nextStatus },
      });

      return record;
    });

    // Perfil público: seguidor nuevo; restringido: solicitud por aprobar.
    await this.notifications.notify({
      type: nextStatus === 'ACCEPTED' ? 'FOLLOW' : 'FOLLOW_REQUEST',
      recipientId: targetUserId,
      actorId: currentUserId,
    });

    return { id: followRecord.id, status: nextStatus };
  }

  // Dejar de seguir o cancelar una solicitud pendiente propia (baja lógica).
  async unfollow(
    targetUserId: string,
    currentUserId: string,
    actor: ActorContext,
  ): Promise<void> {
    if (targetUserId === currentUserId) {
      throw new BadRequestException({
        message: 'No puedes dejar de seguirte a ti mismo',
        code: 'CANNOT_FOLLOW_SELF',
      });
    }

    const follow = await this.prisma.follow.findFirst({
      where: {
        followerId: currentUserId,
        followingId: targetUserId,
        deactivatedAt: null,
      },
    });

    if (!follow) {
      throw new NotFoundException({
        message: 'No sigues a este usuario',
        code: 'FOLLOW_NOT_FOUND',
      });
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.follow.update({
        where: { id: follow.id },
        data: { deactivatedAt: new Date() },
      });

      await this.audit.record(tx, {
        action: 'follow.deactivate',
        entityType: 'follow',
        entityId: follow.id,
        actor,
        succeeded: true,
        metadata: { targetUserId },
      });
    });
  }

  // Aceptar una solicitud de seguimiento dirigida a mí.
  async accept(
    followId: string,
    currentUserId: string,
    actor: ActorContext,
  ): Promise<void> {
    const follow = await this.prisma.follow.findFirst({
      where: {
        id: followId,
        followingId: currentUserId,
        status: 'PENDING',
        deactivatedAt: null,
      },
    });

    if (!follow) {
      throw new NotFoundException({
        message: 'La solicitud no existe',
        code: 'FOLLOW_REQUEST_NOT_FOUND',
      });
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.follow.update({
        where: { id: follow.id },
        data: { status: 'ACCEPTED', respondedAt: new Date() },
      });

      await this.audit.record(tx, {
        action: 'follow.accept',
        entityType: 'follow',
        entityId: follow.id,
        actor,
        succeeded: true,
        metadata: { followerId: follow.followerId },
      });
    });

    await this.notifications.notify({
      type: 'FOLLOW_ACCEPTED',
      recipientId: follow.followerId,
      actorId: currentUserId,
    });
  }

  // Rechazar una solicitud de seguimiento dirigida a mí (baja lógica).
  async reject(
    followId: string,
    currentUserId: string,
    actor: ActorContext,
  ): Promise<void> {
    const follow = await this.prisma.follow.findFirst({
      where: {
        id: followId,
        followingId: currentUserId,
        status: 'PENDING',
        deactivatedAt: null,
      },
    });

    if (!follow) {
      throw new NotFoundException({
        message: 'La solicitud no existe',
        code: 'FOLLOW_REQUEST_NOT_FOUND',
      });
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.follow.update({
        where: { id: follow.id },
        data: { deactivatedAt: new Date() },
      });

      await this.audit.record(tx, {
        action: 'follow.reject',
        entityType: 'follow',
        entityId: follow.id,
        actor,
        succeeded: true,
        metadata: { followerId: follow.followerId },
      });
    });
  }

  // Lista de solicitudes pendientes recibidas por el usuario actual.
  async pendingRequests(
    currentUserId: string,
    query: PageQueryDto,
  ): Promise<FollowRequestPageDto> {
    const after = query.cursor ? await this.afterCursorOf(query.cursor) : null;

    const baseWhere: Prisma.FollowWhereInput = {
      followingId: currentUserId,
      status: 'PENDING',
      deactivatedAt: null,
      follower: ACTIVE,
    };

    const rows = await this.prisma.follow.findMany({
      where: after ? { AND: [baseWhere, after] } : baseWhere,
      orderBy: FOLLOW_ORDER,
      take: query.limit + 1,
      select: {
        id: true,
        createdAt: true,
        follower: { select: USER_CARD_SELECT },
      },
    });

    return toFollowRequestPage(rows, query.limit, (k) => this.urls.urlFor(k));
  }

  // Seguidores de targetUserId (filtrado por VisibilityService).
  async followers(
    targetUserId: string,
    currentUserId: string,
    query: PageQueryDto,
  ): Promise<FollowUserPageDto> {
    await this.assertCanSeeConnections(targetUserId, currentUserId);

    const after = query.cursor ? await this.afterCursorOf(query.cursor) : null;

    const baseWhere: Prisma.FollowWhereInput = {
      followingId: targetUserId,
      status: 'ACCEPTED',
      deactivatedAt: null,
      follower: ACTIVE,
    };

    const rows = await this.prisma.follow.findMany({
      where: after ? { AND: [baseWhere, after] } : baseWhere,
      orderBy: FOLLOW_ORDER,
      take: query.limit + 1,
      select: {
        id: true,
        createdAt: true,
        follower: { select: USER_CARD_SELECT },
      },
    });

    const mapped = rows.map((r) => ({
      id: r.id,
      createdAt: r.createdAt,
      user: r.follower,
    }));
    return toFollowUserPage(mapped, query.limit, (k) => this.urls.urlFor(k));
  }

  // Seguidos por targetUserId (filtrado por VisibilityService).
  async following(
    targetUserId: string,
    currentUserId: string,
    query: PageQueryDto,
  ): Promise<FollowUserPageDto> {
    await this.assertCanSeeConnections(targetUserId, currentUserId);

    const after = query.cursor ? await this.afterCursorOf(query.cursor) : null;

    const baseWhere: Prisma.FollowWhereInput = {
      followerId: targetUserId,
      status: 'ACCEPTED',
      deactivatedAt: null,
      following: ACTIVE,
    };

    const rows = await this.prisma.follow.findMany({
      where: after ? { AND: [baseWhere, after] } : baseWhere,
      orderBy: FOLLOW_ORDER,
      take: query.limit + 1,
      select: {
        id: true,
        createdAt: true,
        following: { select: USER_CARD_SELECT },
      },
    });

    const mapped = rows.map((r) => ({
      id: r.id,
      createdAt: r.createdAt,
      user: r.following,
    }));
    return toFollowUserPage(mapped, query.limit, (k) => this.urls.urlFor(k));
  }

  // Acepta todas las solicitudes pendientes hacia userId (al pasar a PUBLIC,
  // decisión 15). Devuelve los seguimientos que quedaron aceptados.
  async acceptAllPending(
    tx: FollowWriter,
    userId: string,
    now: Date,
  ): Promise<AcceptedFollow[]> {
    const pending = await tx.follow.findMany({
      where: { followingId: userId, status: 'PENDING', deactivatedAt: null },
      select: { id: true, followerId: true },
    });
    if (pending.length === 0) return [];
    await tx.follow.updateMany({
      where: { id: { in: pending.map((f) => f.id) }, status: 'PENDING' },
      data: { status: 'ACCEPTED', respondedAt: now },
    });
    return pending;
  }

  private async assertCanSeeConnections(
    targetUserId: string,
    viewerId: string,
  ): Promise<void> {
    const facts = await this.visibility.visibleProfileFacts(
      viewerId,
      targetUserId,
    );
    if (!facts.isSelf && !canSeeContent(facts)) {
      throw new ForbiddenException({
        message: 'Este perfil comparte su contenido solo con quien lo sigue',
        code: 'PROFILE_RESTRICTED',
      });
    }
  }

  private async afterCursorOf(id: string): Promise<Prisma.FollowWhereInput> {
    const follow = await this.prisma.follow.findUnique({
      where: { id },
      select: { createdAt: true },
    });
    if (!follow) {
      throw new BadRequestException({
        message: 'El cursor no corresponde a ningún elemento',
        code: 'INVALID_CURSOR',
      });
    }
    return afterFollowCursor(follow.createdAt, id);
  }
}
