import { Injectable, NotFoundException } from '@nestjs/common';
import { ACTIVE } from '../../common/soft-delete/soft-delete.js';
import type { ReactionType } from '../../generated/prisma/enums.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { VISIBLE_POST } from '../posts/post-queries.js';
import { VisibilityService } from '../visibility/visibility.service.js';
import type { ReactionStateDto } from './dto/reaction-state.dto.js';

// Reaccionar a una publicación (spec 0009, decisión 20). Poner y quitar son
// idempotentes; la unicidad (postId, userId) de la base cierra la carrera de
// dos toques seguidos. Las reacciones no se auditan.
@Injectable()
export class PostReactionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly visibility: VisibilityService,
    private readonly notifications: NotificationsService,
  ) {}

  // Crea, reactiva o cambia el tipo. Solo crear o reactivar avisa al autor.
  async set(
    postId: string,
    type: ReactionType,
    userId: string,
  ): Promise<ReactionStateDto> {
    const authorId = await this.visibleAuthorId(postId, userId);
    if (await this.activate(postId, userId, type)) {
      await this.notifications.notify({
        recipientId: authorId,
        actorId: userId,
        type: 'POST_REACTION',
        postId,
        once: true,
      });
    }
    return this.state(postId, userId);
  }

  // Sin reacción activa no hace nada y tampoco falla.
  async remove(postId: string, userId: string): Promise<ReactionStateDto> {
    await this.visibleAuthorId(postId, userId);
    await this.prisma.postReaction.updateMany({
      where: { postId, userId, ...ACTIVE },
      data: { deactivatedAt: new Date() },
    });
    return this.state(postId, userId);
  }

  // true si la reacción pasó a existir (nueva o reactivada); cambiar de tipo o
  // repetir el mismo no cuentan. Cada paso es condicional, así dos peticiones
  // simultáneas no pueden crear dos filas ni avisar dos veces.
  private async activate(
    postId: string,
    userId: string,
    type: ReactionType,
  ): Promise<boolean> {
    const reactivated = await this.prisma.postReaction.updateMany({
      where: { postId, userId, deactivatedAt: { not: null } },
      data: { type, deactivatedAt: null },
    });
    if (reactivated.count > 0) return true;
    const changed = await this.prisma.postReaction.updateMany({
      where: { postId, userId, ...ACTIVE, type: { not: type } },
      data: { type },
    });
    if (changed.count > 0) return false;
    const created = await this.prisma.postReaction.createMany({
      data: [{ postId, userId, type }],
      skipDuplicates: true,
    });
    return created.count > 0;
  }

  // 404 si la publicación no existe, no está visible o su autor no deja ver su
  // contenido a quien reacciona (decisión 15); devuelve el autor para avisarle.
  private async visibleAuthorId(
    postId: string,
    viewerId: string,
  ): Promise<string> {
    const post = await this.prisma.post.findFirst({
      where: { id: postId, ...VISIBLE_POST },
      select: { authorId: true },
    });
    if (
      !post ||
      !(await this.visibility.canSeeContent(viewerId, post.authorId))
    ) {
      throw new NotFoundException({
        message: 'La publicación no existe',
        code: 'POST_NOT_FOUND',
      });
    }
    return post.authorId;
  }

  private async state(
    postId: string,
    userId: string,
  ): Promise<ReactionStateDto> {
    const [reactionCount, mine] = await Promise.all([
      this.prisma.postReaction.count({
        where: { postId, ...ACTIVE, user: ACTIVE },
      }),
      this.prisma.postReaction.findFirst({
        where: { postId, userId, ...ACTIVE },
        select: { type: true },
      }),
    ]);
    return { reactionCount, myReaction: mine?.type ?? null };
  }
}
