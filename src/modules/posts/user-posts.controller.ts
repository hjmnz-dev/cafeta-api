import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../../common/actor/actor-context.js';
import { CurrentUser } from '../../common/actor/current-user.decorator.js';
import { AuthorPostsQueryDto } from './dto/author-posts-query.dto.js';
import { PostCountDto, PostPageDto } from './dto/post-page.dto.js';
import { PostsReadService } from './posts-read.service.js';

// Publicaciones de un perfil, propio o ajeno, según VisibilityService (decisión 15).
@ApiTags('posts')
@ApiBearerAuth()
@Controller('users/:userId/posts')
export class UserPostsController {
  constructor(private readonly reads: PostsReadService) {}

  @Get()
  list(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Query() query: AuthorPostsQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PostPageDto> {
    return this.reads.byAuthor(user.id, userId, query);
  }

  @Get('count')
  count(
    @Param('userId', ParseUUIDPipe) userId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PostCountDto> {
    return this.reads.countVisibleByAuthor(user.id, userId);
  }
}
