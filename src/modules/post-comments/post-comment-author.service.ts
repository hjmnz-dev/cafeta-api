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
import { MediaUrlService } from '../uploads/media-url.service.js';
import { PostAccessService } from '../posts/post-access.service.js';

// Editar y desactivar mis comentarios (spec 0009, decisión 21). Solo el autor
// del comentario puede; el autor de la publicación no quita comentarios ajenos.
@Injectable()
export class PostCommentAuthorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly access: PostAccessService,
    private readonly urls: MediaUrlService,
  ) {}

  async edit(
    postId: string,
    commentId: string,
    dto: CommentContentDto,
    user: AuthenticatedUser,
    actor: ActorContext,
  ): Promise<CommentViewDto> {
    const content = normalizeComment(dto.content);
    await this.access.authorIdOf(postId, user.id);
    const row = await this.prisma.$transaction(async (tx) => {
      // Una sola sentencia condicional: si otra petición lo desactiva en este
      // instante, no se edita nada.
      const { count } = await tx.postComment.updateMany({
        where: {
          id: commentId,
          postId,
          authorId: user.id,
          deactivatedAt: null,
        },
        data: { content, editedAt: new Date() },
      });
      if (count === 0) throw await this.rejection(postId, commentId, user.id);
      await this.audit.record(tx, {
        action: 'post_comment.update',
        entityType: 'post_comment',
        entityId: commentId,
        actor,
        succeeded: true,
      });
      return tx.postComment.findUniqueOrThrow({
        where: { id: commentId },
        select: COMMENT_VIEW_SELECT,
      });
    });
    return toCommentView(row, user.id, (key) => this.urls.urlFor(key));
  }

  // Baja lógica (spec 0003): la fila queda en post_comments y en la auditoría.
  async deactivate(
    postId: string,
    commentId: string,
    user: AuthenticatedUser,
    actor: ActorContext,
  ): Promise<void> {
    await this.access.authorIdOf(postId, user.id);
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.postComment.updateMany({
        where: {
          id: commentId,
          postId,
          authorId: user.id,
          deactivatedAt: null,
        },
        data: { deactivatedAt: new Date() },
      });
      if (count === 0) throw await this.rejection(postId, commentId, user.id);
      await this.audit.record(tx, {
        action: 'post_comment.deactivate',
        entityType: 'post_comment',
        entityId: commentId,
        actor,
        succeeded: true,
      });
    });
  }

  // Por qué no se cambió nada: no existe, no es mío o ya estaba desactivado.
  private async rejection(postId: string, commentId: string, userId: string) {
    const comment = await this.prisma.postComment.findFirst({
      where: { id: commentId, postId },
      select: { authorId: true, deactivatedAt: true },
    });
    return (
      (comment && commentChangeBlock(comment, userId)) ?? commentNotFound()
    );
  }
}
