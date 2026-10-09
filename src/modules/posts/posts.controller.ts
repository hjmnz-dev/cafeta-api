import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
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
import { PageQueryDto } from './dto/page-query.dto.js';
import { UpdatePostDto } from './dto/update-post.dto.js';
import { PostArchiveService } from './post-archive.service.js';
import { PostAuthorService } from './post-author.service.js';
import { PostsReadService } from './posts-read.service.js';
import { PostsService } from './posts.service.js';

@ApiTags('posts')
@ApiBearerAuth()
@Controller('posts')
export class PostsController {
  constructor(
    private readonly posts: PostsService,
    private readonly reads: PostsReadService,
    private readonly author: PostAuthorService,
    private readonly archiveService: PostArchiveService,
  ) {}

  @UseGuards(UserThrottlerGuard)
  @SkipThrottle({ auth: true, reset: true, comments: true })
  @Post()
  create(
    @Body() dto: CreatePostDto,
    @CurrentUser() user: AuthenticatedUser,
    @Actor() actor: ActorContext,
  ): Promise<PostViewDto> {
    return this.posts.create(dto, user, actor);
  }

  @Get('archived')
  archived(
    @Query() query: PageQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PostPageDto> {
    return this.reads.hidden(user.id, query);
  }

  @Post(':id/archive')
  @HttpCode(204)
  archive(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Actor() actor: ActorContext,
  ): Promise<void> {
    return this.archiveService.archive(id, user, actor);
  }

  @Post(':id/restore')
  @HttpCode(204)
  restore(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Actor() actor: ActorContext,
  ): Promise<void> {
    return this.archiveService.restore(id, user, actor);
  }

  @Get('feed')
  feed(
    @Query() query: FeedQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PostPageDto> {
    return this.reads.feed(user.id, query);
  }

  // Acciones del autor (spec 0008, decisión 17).
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePostDto,
    @CurrentUser() user: AuthenticatedUser,
    @Actor() actor: ActorContext,
  ): Promise<PostViewDto> {
    return this.author.update(id, dto, user, actor);
  }

  @Post(':id/deactivate')
  @HttpCode(204)
  deactivate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Actor() actor: ActorContext,
  ): Promise<void> {
    return this.author.changeState(id, 'deactivate', user, actor);
  }

  @Post(':id/reactivate')
  @HttpCode(204)
  reactivate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Actor() actor: ActorContext,
  ): Promise<void> {
    return this.author.changeState(id, 'reactivate', user, actor);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Actor() actor: ActorContext,
  ): Promise<void> {
    return this.author.remove(id, user, actor);
  }
}
