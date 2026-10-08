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
import { StoryAccessService } from '../stories/story-access.service.js';
import { MediaUrlService } from '../uploads/media-url.service.js';
import { VisibilityService } from '../visibility/visibility.service.js';

// Leer y escribir comentarios de una historia (spec 0009, decisión 24), con las
// mismas reglas y helpers que los de publicaciones. Editar y desactivar los
// propios vive en StoryCommentAuthorService.
@Injectable()
export class StoryCommentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly access: StoryAccessService,
    private readonly visibility: VisibilityService,
    private readonly notifications: NotificationsService,
    private readonly urls: MediaUrlService,
  ) {}

  // Del más antiguo al más nuevo. Oculta los comentarios de cuentas
  // desactivadas y de quienes tienen un bloqueo con quien mira. Una historia
  // vencida responde 404 y sus comentarios dejan de verse con ella.
  async list(
    storyId: string,
    { cursor, limit }: PageQueryDto,
    user: AuthenticatedUser,
  ): Promise<CommentPageDto> {
    await this.access.authorIdOf(storyId, user.id);
    const where: Prisma.StoryCommentWhereInput = {
      storyId,
      ...ACTIVE,
      author: { AND: [ACTIVE, this.visibility.contentAuthorWhere(user.id)] },
    };
    const after = cursor ? await this.afterCursorOf(storyId, cursor) : null;
    const rows = await this.prisma.storyComment.findMany({
      where: after ? { AND: [where, after] } : where,
      orderBy: [...COMMENT_ORDER],
      take: limit + 1,
      select: COMMENT_VIEW_SELECT,
    });
    return toCommentPage(rows, limit, user.id, (key) => this.urls.urlFor(key));
  }

  async create(
    storyId: string,
    dto: CommentContentDto,
    user: AuthenticatedUser,
    actor: ActorContext,
  ): Promise<CommentViewDto> {
    const content = normalizeComment(dto.content);
    const storyAuthorId = await this.access.authorIdOf(storyId, user.id);
    const row = await this.prisma.$transaction(async (tx) => {
      const comment = await tx.storyComment.create({
        data: { storyId, authorId: user.id, content },
        select: COMMENT_VIEW_SELECT,
      });
      await this.audit.record(tx, {
        action: 'story_comment.create',
        entityType: 'story_comment',
        entityId: comment.id,
        actor,
        succeeded: true,
      });
      return comment;
    });
    // Después de confirmar: el aviso nunca lanza y no se manda a quien comenta
    // en su propia historia.
    await this.notifications.notify({
      recipientId: storyAuthorId,
      actorId: user.id,
      type: 'STORY_COMMENT',
      storyId,
    });
    return toCommentView(row, user.id, (key) => this.urls.urlFor(key));
  }

  // No se usa el cursor nativo de Prisma: un comentario que ya no existe daría
  // una lista vacía y la web creería que terminó.
  private async afterCursorOf(
    storyId: string,
    id: string,
  ): Promise<Prisma.StoryCommentWhereInput> {
    const comment = await this.prisma.storyComment.findFirst({
      where: { id, storyId },
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
