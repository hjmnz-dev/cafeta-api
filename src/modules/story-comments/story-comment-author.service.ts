import { Injectable } from '@nestjs/common';
import type {
  ActorContext,
  AuthenticatedUser,
} from '../../common/actor/actor-context.js';
import { AuditService } from '../../common/audit/audit.service.js';
import { COMMENT_VIEW_SELECT } from '../../common/comments/comment-queries.js';
import {
  commentChangeBlock,
  commentNotFound,
  normalizeComment,
} from '../../common/comments/comment-rules.js';
import type {
  CommentContentDto,
  CommentViewDto,
} from '../../common/comments/comment-view.dto.js';
import { toCommentView } from '../../common/comments/comment-view.mapper.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { StoryAccessService } from '../stories/story-access.service.js';
import { MediaUrlService } from '../uploads/media-url.service.js';

// Editar y desactivar mis comentarios de una historia (spec 0009, decisión 24).
// Solo el autor del comentario puede; el autor de la historia no quita
// comentarios ajenos. Con la historia vencida o desactivada, 404.
@Injectable()
export class StoryCommentAuthorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly access: StoryAccessService,
    private readonly urls: MediaUrlService,
  ) {}

  async edit(
    storyId: string,
    commentId: string,
    dto: CommentContentDto,
    user: AuthenticatedUser,
    actor: ActorContext,
  ): Promise<CommentViewDto> {
    const content = normalizeComment(dto.content);
    await this.access.authorIdOf(storyId, user.id);
    const row = await this.prisma.$transaction(async (tx) => {
      // Una sola sentencia condicional: si otra petición lo desactiva en este
      // instante, no se edita nada.
      const { count } = await tx.storyComment.updateMany({
        where: {
          id: commentId,
          storyId,
          authorId: user.id,
          deactivatedAt: null,
        },
        data: { content, editedAt: new Date() },
      });
      if (count === 0) throw await this.rejection(storyId, commentId, user.id);
      await this.audit.record(tx, {
        action: 'story_comment.update',
        entityType: 'story_comment',
        entityId: commentId,
        actor,
        succeeded: true,
      });
      return tx.storyComment.findUniqueOrThrow({
        where: { id: commentId },
        select: COMMENT_VIEW_SELECT,
      });
    });
    return toCommentView(row, user.id, (key) => this.urls.urlFor(key));
  }

  // Baja lógica (spec 0003): la fila queda en story_comments y en la auditoría.
  async deactivate(
    storyId: string,
    commentId: string,
    user: AuthenticatedUser,
    actor: ActorContext,
  ): Promise<void> {
    await this.access.authorIdOf(storyId, user.id);
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.storyComment.updateMany({
        where: {
          id: commentId,
          storyId,
          authorId: user.id,
          deactivatedAt: null,
        },
        data: { deactivatedAt: new Date() },
      });
      if (count === 0) throw await this.rejection(storyId, commentId, user.id);
      await this.audit.record(tx, {
        action: 'story_comment.deactivate',
        entityType: 'story_comment',
        entityId: commentId,
        actor,
        succeeded: true,
      });
    });
  }

  // Por qué no se cambió nada: no existe, no es mío o ya estaba desactivado.
  private async rejection(storyId: string, commentId: string, userId: string) {
    const comment = await this.prisma.storyComment.findFirst({
      where: { id: commentId, storyId },
      select: { authorId: true, deactivatedAt: true },
    });
    return (
      (comment && commentChangeBlock(comment, userId)) ?? commentNotFound()
    );
  }
}
