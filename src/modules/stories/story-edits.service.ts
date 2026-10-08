import { Injectable } from '@nestjs/common';
import type {
  ActorContext,
  AuthenticatedUser,
} from '../../common/actor/actor-context.js';
import { AuditService } from '../../common/audit/audit.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { MediaUrlService } from '../uploads/media-url.service.js';
import type { EditStoryDto } from './dto/edit-story.dto.js';
import type { StoryViewDto } from './dto/story-view.dto.js';
import { liveStoryWhere, storyViewSelect } from './story-queries.js';
import { storyChangeBlock, storyNotFound } from './story-rules.js';
import { toStoryView } from './story-view.mapper.js';

// Editar el texto y desactivar historias propias (spec 0009, decisión 23). Solo
// el autor puede, y solo mientras la historia está vigente. Editar nunca toca
// expiresAt: la vigencia original se conserva.
@Injectable()
export class StoryEditsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly urls: MediaUrlService,
  ) {}

  async edit(
    id: string,
    dto: EditStoryDto,
    user: AuthenticatedUser,
    actor: ActorContext,
  ): Promise<StoryViewDto> {
    const now = new Date();
    const row = await this.prisma.$transaction(async (tx) => {
      // Una sola sentencia condicional: si otra petición desactiva o la
      // historia vence en este instante, no se edita nada.
      const { count } = await tx.story.updateMany({
        where: { id, authorId: user.id, ...liveStoryWhere(now) },
        data: { text: dto.text.trim() || null, editedAt: now },
      });
      if (count === 0) throw await this.rejection(id, user.id, now);
      await this.audit.record(tx, {
        action: 'story.update',
        entityType: 'story',
        entityId: id,
        actor,
        succeeded: true,
        metadata: { by: 'self' },
      });
      return tx.story.findUniqueOrThrow({
        where: { id },
        select: storyViewSelect(user.id),
      });
    });
    const view = toStoryView(row, user.id, (key) => this.urls.urlFor(key));
    if (!view) throw storyNotFound();
    return view;
  }

  // Baja lógica (spec 0003): la fila se conserva y la historia deja de salir
  // en la bandeja. No hay reactivar.
  async deactivate(
    id: string,
    user: AuthenticatedUser,
    actor: ActorContext,
  ): Promise<void> {
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.story.updateMany({
        where: { id, authorId: user.id, ...liveStoryWhere(now) },
        data: { deactivatedAt: now },
      });
      if (count === 0) throw await this.rejection(id, user.id, now);
      await this.audit.record(tx, {
        action: 'story.deactivate',
        entityType: 'story',
        entityId: id,
        actor,
        succeeded: true,
        metadata: { by: 'self' },
      });
    });
  }

  // Por qué no se cambió nada: no existe, no es mía, ya estaba desactivada o ya venció.
  private async rejection(id: string, userId: string, now: Date) {
    const story = await this.prisma.story.findUnique({
      where: { id },
      select: { authorId: true, deactivatedAt: true, expiresAt: true },
    });
    return (story && storyChangeBlock(story, userId, now)) ?? storyNotFound();
  }
}
