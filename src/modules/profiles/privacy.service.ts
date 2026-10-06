import { Injectable } from '@nestjs/common';
import type { ActorContext } from '../../common/actor/actor-context.js';
import { AuditService } from '../../common/audit/audit.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  FollowsService,
  type AcceptedFollow,
} from '../follows/follows.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { UsersService } from '../users/users.service.js';
import type { PrivacyDto, UpdatePrivacyDto } from './dto/privacy.dto.js';

// Privacidad de la cuenta (decisión 15, HU07).
@Injectable()
export class PrivacyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly follows: FollowsService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  async get(userId: string): Promise<PrivacyDto> {
    return { visibility: await this.users.findVisibility(userId) };
  }

  // Al pasar a PUBLIC, las solicitudes pendientes se aceptan solas.
  // Los avisos FOLLOW_ACCEPTED salen después de confirmar la transacción.
  async update(
    userId: string,
    { visibility }: UpdatePrivacyDto,
    actor: ActorContext,
  ): Promise<PrivacyDto> {
    const accepted = await this.apply(userId, visibility, actor);
    for (const follow of accepted) {
      await this.notifications.notify({
        type: 'FOLLOW_ACCEPTED',
        recipientId: follow.followerId,
        actorId: userId,
      });
    }
    return { visibility };
  }

  // Devuelve las solicitudes que quedaron aceptadas solas.
  private apply(
    userId: string,
    visibility: UpdatePrivacyDto['visibility'],
    actor: ActorContext,
  ): Promise<AcceptedFollow[]> {
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const before = await this.users.updateVisibility(tx, userId, visibility);
      if (before === visibility) return [];
      const accepted =
        visibility === 'PUBLIC'
          ? await this.follows.acceptAllPending(tx, userId, now)
          : [];
      await this.audit.record(tx, {
        action: 'privacy.update',
        entityType: 'profile',
        entityId: userId,
        actor,
        succeeded: true,
        metadata: { from: before, to: visibility },
      });
      for (const follow of accepted) {
        await this.audit.record(tx, {
          action: 'follow.accept',
          entityType: 'follow',
          entityId: follow.id,
          actor,
          succeeded: true,
          metadata: { followerId: follow.followerId, automatic: true },
        });
      }
      return accepted;
    });
  }
}
