import { Injectable } from '@nestjs/common';
import { ACTIVE } from '../../common/soft-delete/soft-delete.js';
import type { ReactionType } from '../../generated/prisma/enums.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { StoryAccessService } from '../stories/story-access.service.js';
import type { StoryReactionStateDto } from './dto/story-reaction-state.dto.js';

// Reaccionar a una historia (spec 0009, decisión 24). Poner y quitar son
// idempotentes; la unicidad (storyId, userId) de la base cierra la carrera de
// dos toques seguidos. Las reacciones no se auditan.
@Injectable()
export class StoryReactionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: StoryAccessService,
    private readonly notifications: NotificationsService,
  ) {}

  // Crea, reactiva o cambia el tipo. Solo crear o reactivar avisa al autor.
  async set(
    storyId: string,
    type: ReactionType,
    userId: string,
  ): Promise<StoryReactionStateDto> {
    const authorId = await this.access.authorIdOf(storyId, userId);
    if (await this.activate(storyId, userId, type)) {
      await this.notifications.notify({
        recipientId: authorId,
        actorId: userId,
        type: 'STORY_REACTION',
        storyId,
        once: true,
      });
    }
    return this.state(storyId, userId, authorId);
  }

  // Sin reacción activa no hace nada y tampoco falla.
  async remove(
    storyId: string,
    userId: string,
  ): Promise<StoryReactionStateDto> {
    const authorId = await this.access.authorIdOf(storyId, userId);
    await this.prisma.storyReaction.updateMany({
      where: { storyId, userId, ...ACTIVE },
      data: { deactivatedAt: new Date() },
    });
    return this.state(storyId, userId, authorId);
  }

  // true si la reacción pasó a existir (nueva o reactivada); cambiar de tipo o
  // repetir el mismo no cuentan. Cada paso es condicional, así dos peticiones
  // simultáneas no pueden crear dos filas ni avisar dos veces.
  private async activate(
    storyId: string,
    userId: string,
    type: ReactionType,
  ): Promise<boolean> {
    const reactivated = await this.prisma.storyReaction.updateMany({
      where: { storyId, userId, deactivatedAt: { not: null } },
      data: { type, deactivatedAt: null },
    });
    if (reactivated.count > 0) return true;
    const changed = await this.prisma.storyReaction.updateMany({
      where: { storyId, userId, ...ACTIVE, type: { not: type } },
      data: { type },
    });
    if (changed.count > 0) return false;
    const created = await this.prisma.storyReaction.createMany({
      data: [{ storyId, userId, type }],
      skipDuplicates: true,
    });
    return created.count > 0;
  }

  // El conteo es solo del autor: a los demás no se les calcula ni se les da.
  private async state(
    storyId: string,
    userId: string,
    authorId: string,
  ): Promise<StoryReactionStateDto> {
    const [reactionCount, mine] = await Promise.all([
      authorId === userId
        ? this.prisma.storyReaction.count({
            where: { storyId, ...ACTIVE, user: ACTIVE },
          })
        : Promise.resolve(null),
      this.prisma.storyReaction.findFirst({
        where: { storyId, userId, ...ACTIVE },
        select: { type: true },
      }),
    ]);
    return { reactionCount, myReaction: mine?.type ?? null };
  }
}
