import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../../common/actor/actor-context.js';
import { CurrentUser } from '../../common/actor/current-user.decorator.js';
import { PageQueryDto } from '../posts/dto/page-query.dto.js';
import { PostPageDto } from '../posts/dto/post-page.dto.js';
import { SearchQueryDto } from './dto/search-query.dto.js';
import { SearchUserPageDto } from './dto/search-user-view.dto.js';
import { SearchService } from './search.service.js';

@ApiTags('search')
@ApiBearerAuth()
@Controller()
export class SearchController {
  constructor(private readonly search: SearchService) {}

  /** Personas por nombre, usuario o carrera; ignora mayúsculas y acentos. */
  @Get('search/users')
  users(
    @Query() query: SearchQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<SearchUserPageDto> {
    return this.search.users(user.id, query.q, query);
  }

  /** Publicaciones que contienen el texto y que quien busca puede ver. */
  @Get('search/posts')
  posts(
    @Query() query: SearchQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PostPageDto> {
    return this.search.posts(user.id, query.q, query);
  }

  /** Publicaciones recientes y movidas de otras personas. */
  @Get('explore/posts')
  explore(
    @Query() query: PageQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PostPageDto> {
    return this.search.explore(user.id, query);
  }
}
