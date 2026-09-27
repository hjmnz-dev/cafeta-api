import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Actor } from '../../common/actor/actor.decorator.js';
import type {
  ActorContext,
  AuthenticatedUser,
} from '../../common/actor/actor-context.js';
import { CurrentUser } from '../../common/actor/current-user.decorator.js';
import { UserThrottlerGuard } from '../../common/rate-limit/user-throttler.guard.js';
import { CreatePostDto } from './dto/create-post.dto.js';
import { FeedQueryDto } from './dto/feed-query.dto.js';
import { PostPageDto } from './dto/post-page.dto.js';
import { PostViewDto } from './dto/post-view.dto.js';
import { PostsReadService } from './posts-read.service.js';
import { PostsService } from './posts.service.js';

@ApiTags('posts')
@ApiBearerAuth()
@Controller('posts')
export class PostsController {
  constructor(
    private readonly posts: PostsService,
    private readonly reads: PostsReadService,
  ) {}

  @UseGuards(UserThrottlerGuard)
  @SkipThrottle({ auth: true })
  @Post()
  create(
    @Body() dto: CreatePostDto,
    @CurrentUser() user: AuthenticatedUser,
    @Actor() actor: ActorContext,
  ): Promise<PostViewDto> {
    return this.posts.create(dto, user, actor);
  }

  @Get('feed')
  feed(
    @Query() query: FeedQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PostPageDto> {
    return this.reads.feed(user.id, query);
  }
}
