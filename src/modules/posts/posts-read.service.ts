import { BadRequestException, Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { FeedQueryDto } from './dto/feed-query.dto.js';
import type { PageQueryDto } from './dto/page-query.dto.js';
import type { PostCountDto, PostPageDto } from './dto/post-page.dto.js';
import {
  afterCursor,
  authorWhere,
  feedWhere,
  POST_ORDER,
  POST_VIEW_SELECT,
} from './post-queries.js';
import { MediaUrlService } from '../uploads/media-url.service.js';
import { toPostPage } from './post-view.mapper.js';

// Lecturas de publicaciones (spec 0005). Aquí se sumarán los filtros de
// privacidad (funcionalidad 15) y de bloqueos (funcionalidad 29).
@Injectable()
export class PostsReadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly urls: MediaUrlService,
  ) {}

  feed(userId: string, query: FeedQueryDto): Promise<PostPageDto> {
    return this.page(feedWhere(userId, query.careerId), query);
  }

  byAuthor(authorId: string, query: PageQueryDto): Promise<PostPageDto> {
    return this.page(authorWhere(authorId), query);
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
