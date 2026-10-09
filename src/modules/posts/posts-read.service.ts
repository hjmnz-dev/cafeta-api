import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { canSeeContent } from '../visibility/visibility-rules.js';
import { VisibilityService } from '../visibility/visibility.service.js';
import type { FeedQueryDto } from './dto/feed-query.dto.js';
import type { PageQueryDto } from './dto/page-query.dto.js';
import type { PostCountDto, PostPageDto } from './dto/post-page.dto.js';
import {
  afterCursor,
  authorWhere,
  feedWhere,
  hiddenWhere,
  POST_ORDER,
  POST_VIEW_SELECT,
  VISIBLE_POST,
} from './post-queries.js';
import { MediaUrlService } from '../uploads/media-url.service.js';
import { toPostPage } from './post-view.mapper.js';

// Lo mínimo de una publicación visible que otro módulo necesita (reportes, decisión 30).
export type VisiblePostSummary = Pick<
  Prisma.PostGetPayload<object>,
  'authorId' | 'type' | 'content'
>;

// Lecturas de publicaciones (spec 0005). La privacidad y los bloqueos los
// decide VisibilityService (decisión 15).
@Injectable()
export class PostsReadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly urls: MediaUrlService,
    private readonly visibility: VisibilityService,
  ) {}

  feed(userId: string, query: FeedQueryDto): Promise<PostPageDto> {
    const visibleAuthor = this.visibility.contentAuthorWhere(userId);
    return this.page(feedWhere(userId, visibleAuthor, query.careerId), query);
  }

  // Mis archivadas y desactivadas (HU21, HU23): solo las veo yo.
  hidden(userId: string, query: PageQueryDto): Promise<PostPageDto> {
    return this.page(hiddenWhere(userId), query);
  }

  // Publicaciones de un perfil: 404 si quien mira no ve el perfil, 403 si lo ve
  // limitado (FOLLOWERS sin seguirlo, o PRIVATE).
  async byAuthor(
    viewerId: string,
    authorId: string,
    query: PageQueryDto,
  ): Promise<PostPageDto> {
    const facts = await this.visibility.visibleProfileFacts(viewerId, authorId);
    if (!canSeeContent(facts)) {
      throw new ForbiddenException({
        message: 'El perfil es privado para ti',
        code: 'PROFILE_RESTRICTED',
      });
    }
    return this.page(authorWhere(authorId), query);
  }

  // El conteo forma parte del perfil limitado: solo pide que el perfil se vea.
  async countVisibleByAuthor(
    viewerId: string,
    authorId: string,
  ): Promise<PostCountDto> {
    await this.visibility.visibleProfileFacts(viewerId, authorId);
    return this.countByAuthor(authorId);
  }

  // null si no existe, está archivada o desactivada. No mira la privacidad del autor.
  visibleSummary(id: string): Promise<VisiblePostSummary | null> {
    return this.prisma.post.findFirst({
      where: { id, ...VISIBLE_POST },
      select: { authorId: true, type: true, content: true },
    });
  }

  async countByAuthor(authorId: string): Promise<PostCountDto> {
    return {
      count: await this.prisma.post.count({ where: authorWhere(authorId) }),
    };
  }

  private async page(
    where: Prisma.PostWhereInput,
    { cursor, limit }: PageQueryDto,
  ): Promise<PostPageDto> {
    const after = cursor ? await this.afterCursorOf(cursor) : null;
    const rows = await this.prisma.post.findMany({
      where: after ? { AND: [where, after] } : where,
      orderBy: POST_ORDER,
      take: limit + 1,
      select: POST_VIEW_SELECT,
    });
    return toPostPage(rows, limit, (key) => this.urls.urlFor(key));
  }

  // No se usa el cursor nativo de Prisma: si la publicación ya no existe
  // devuelve una lista vacía y la web creería que la lista terminó.
  private async afterCursorOf(id: string): Promise<Prisma.PostWhereInput> {
    const post = await this.prisma.post.findUnique({
      where: { id },
      select: { createdAt: true },
    });
    if (!post) {
      throw new BadRequestException({
        message: 'El cursor no corresponde a ninguna publicación',
        code: 'INVALID_CURSOR',
      });
    }
    return afterCursor(post.createdAt, id);
  }
}
