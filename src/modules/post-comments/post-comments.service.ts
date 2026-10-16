import { BadRequestException, Injectable } from '@nestjs/common';
import type {
  ActorContext,
  AuthenticatedUser,
} from '../../common/actor/actor-context.js';
import { AuditService } from '../../common/audit/audit.service.js';
import {
  afterComment,
  COMMENT_ORDER,
  COMMENT_VIEW_SELECT,
} from '../../common/comments/comment-queries.js';
import { normalizeComment } from '../../common/comments/comment-rules.js';
import type {
  CommentContentDto,
  CommentPageDto,
  CommentViewDto,
} from '../../common/comments/comment-view.dto.js';
import {
  toCommentPage,
  toCommentView,
} from '../../common/comments/comment-view.mapper.js';
import { ACTIVE } from '../../common/soft-delete/soft-delete.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import type { PageQueryDto } from '../posts/dto/page-query.dto.js';
import { MediaUrlService } from '../uploads/media-url.service.js';
import { VisibilityService } from '../visibility/visibility.service.js';
import { PostAccessService } from '../posts/post-access.service.js';

// Leer y escribir comentarios de una publicación (spec 0009, decisión 21).
// Editar y desactivar los propios vive en PostCommentAuthorService.
@Injectable()
export class PostCommentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly access: PostAccessService,
    private readonly visibility: VisibilityService,
    private readonly notifications: NotificationsService,
    private readonly urls: MediaUrlService,
  ) {}

  // Del más antiguo al más nuevo. Oculta los comentarios de cuentas
  // desactivadas y de quienes tienen un bloqueo con quien mira.
  async list(
    postId: string,
    { cursor, limit }: PageQueryDto,
    user: AuthenticatedUser,
  ): Promise<CommentPageDto> {
    await this.access.readableAuthorIdOf(postId, user.id);
    const where: Prisma.PostCommentWhereInput = {
      postId,
      ...ACTIVE,
      author: { AND: [ACTIVE, this.visibility.contentAuthorWhere(user.id)] },
    };
    const after = cursor ? await this.afterCursorOf(postId, cursor) : null;
    const rows = await this.prisma.postComment.findMany({
      where: after ? { AND: [where, after] } : where,
      orderBy: [...COMMENT_ORDER],
      take: limit + 1,
      select: COMMENT_VIEW_SELECT,
    });
    return toCommentPage(rows, limit, user.id, (key) => this.urls.urlFor(key));
  }

  async create(
    postId: string,
    dto: CommentContentDto,
    user: AuthenticatedUser,
    actor: ActorContext,
  ): Promise<CommentViewDto> {
    const content = normalizeComment(dto.content);
    const postAuthorId = await this.access.authorIdOf(postId, user.id);
    const row = await this.prisma.$transaction(async (tx) => {
      const comment = await tx.postComment.create({
        data: { postId, authorId: user.id, content },
        select: COMMENT_VIEW_SELECT,
      });
      await this.audit.record(tx, {
        action: 'post_comment.create',
        entityType: 'post_comment',
        entityId: comment.id,
        actor,
        succeeded: true,
      });
      return comment;
    });
    // Después de confirmar: el aviso nunca lanza y no se manda a quien comenta
    // en su propia publicación.
    await this.notifications.notify({
      recipientId: postAuthorId,
      actorId: user.id,
      type: 'POST_COMMENT',
      postId,
    });
    return toCommentView(row, user.id, (key) => this.urls.urlFor(key));
  }

  // No se usa el cursor nativo de Prisma: un comentario que ya no existe daría
  // una lista vacía y la web creería que terminó.
  private async afterCursorOf(
    postId: string,
    id: string,
  ): Promise<Prisma.PostCommentWhereInput> {
    const comment = await this.prisma.postComment.findFirst({
      where: { id, postId },
      select: { createdAt: true },
    });
    if (!comment) {
      throw new BadRequestException({
        message: 'El cursor no corresponde a ningún comentario',
        code: 'INVALID_CURSOR',
      });
    }
    return afterComment(comment.createdAt, id);
  }
}
