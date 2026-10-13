import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { PageQueryDto } from '../posts/dto/page-query.dto.js';
import type { PostPageDto } from '../posts/dto/post-page.dto.js';
import { postViewSelect, VISIBLE_POST } from '../posts/post-queries.js';
import { toPostView } from '../posts/post-view.mapper.js';
import { MediaUrlService } from '../uploads/media-url.service.js';
import { VisibilityService } from '../visibility/visibility.service.js';
import { inOrderOf, windowAfter } from './search-paging.js';
import { queryTerms } from './search-terms.js';
import type { SearchUserPageDto } from './dto/search-user-view.dto.js';
import { searchUserSelect, toSearchUserView } from './search-user-view.js';
import { SearchRepository } from './search.repository.js';

// Buscar y explorar (spec 0008, decisión 28). El repositorio encuentra y ordena
// ids; aquí se filtran con la regla única de VisibilityService (decisión 15) y
// se arma la página. Un id que quien mira no puede ver nunca llega a la página.
@Injectable()
export class SearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repository: SearchRepository,
    private readonly visibility: VisibilityService,
    private readonly urls: MediaUrlService,
  ) {}

  // Personas activas, sin bloqueo con quien mira y sin quien mira.
  async users(
    viewerId: string,
    q: string,
    { cursor, limit }: PageQueryDto,
  ): Promise<SearchUserPageDto> {
    const candidates = await this.repository.userIds(queryTerms(q));
    const visible = await this.prisma.user.findMany({
      where: {
        AND: [
          { id: { in: candidates, not: viewerId } },
          this.visibility.profileWhere(viewerId),
        ],
      },
      select: { id: true },
    });
    const ids = inOrderOf(candidates, visible).map((u) => u.id);
    const window = windowAfter(ids, cursor, limit);
    if (!window.ok) throw invalidCursor();
    const rows = await this.prisma.user.findMany({
      where: { id: { in: window.ids } },
      select: searchUserSelect(viewerId),
    });
    return {
      items: inOrderOf(window.ids, rows).map((row) =>
        toSearchUserView(row, (key) => this.urls.urlFor(key)),
      ),
      nextCursor: window.hasMore ? (window.ids.at(-1) ?? null) : null,
    };
  }

  // Publicaciones cuyo texto coincide y que quien mira puede ver.
  async posts(
    viewerId: string,
    q: string,
    query: PageQueryDto,
  ): Promise<PostPageDto> {
    return this.postsPage(
      viewerId,
      await this.repository.postIds(queryTerms(q)),
      query,
    );
  }

  // Explorar: publicaciones recientes y movidas de otras personas.
  async explore(viewerId: string, query: PageQueryDto): Promise<PostPageDto> {
    return this.postsPage(
      viewerId,
      await this.repository.exploreIds(viewerId),
      query,
    );
  }

  private async postsPage(
    viewerId: string,
    candidates: string[],
    { cursor, limit }: PageQueryDto,
  ): Promise<PostPageDto> {
    const visible = await this.prisma.post.findMany({
      where: {
        AND: [
          { id: { in: candidates } },
          VISIBLE_POST,
          { author: this.visibility.contentAuthorWhere(viewerId) },
        ],
      },
      select: { id: true },
    });
    const ids = inOrderOf(candidates, visible).map((p) => p.id);
    const window = windowAfter(ids, cursor, limit);
    if (!window.ok) throw invalidCursor();
    const rows = await this.prisma.post.findMany({
      where: { id: { in: window.ids } },
      select: postViewSelect(viewerId),
    });
    return {
      items: inOrderOf(window.ids, rows).map((row) =>
        toPostView(row, (key) => this.urls.urlFor(key)),
      ),
      nextCursor: window.hasMore ? (window.ids.at(-1) ?? null) : null,
    };
  }
}

function invalidCursor(): BadRequestException {
  return new BadRequestException({
    message: 'El cursor no corresponde a ningún elemento de esta lista',
    code: 'INVALID_CURSOR',
  });
}
