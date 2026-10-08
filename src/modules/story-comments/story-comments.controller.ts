import {
  Body,
  Controller,
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
import {
  CommentContentDto,
  CommentPageDto,
  CommentViewDto,
} from '../../common/comments/comment-view.dto.js';
import { UserThrottlerGuard } from '../../common/rate-limit/user-throttler.guard.js';
import { PageQueryDto } from '../posts/dto/page-query.dto.js';
import { StoryCommentAuthorService } from './story-comment-author.service.js';
import { StoryCommentsService } from './story-comments.service.js';

@ApiTags('story-comments')
@ApiBearerAuth()
@Controller('stories/:id/comments')
export class StoryCommentsController {
  constructor(
    private readonly comments: StoryCommentsService,
    private readonly author: StoryCommentAuthorService,
  ) {}

  /** Comentarios de la historia, del más antiguo al más nuevo. */
  @Get()
  list(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: PageQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<CommentPageDto> {
    return this.comments.list(id, query, user);
  }

  @UseGuards(UserThrottlerGuard)
  @SkipThrottle({ auth: true, posts: true })
  @Post()
  create(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CommentContentDto,
    @CurrentUser() user: AuthenticatedUser,
    @Actor() actor: ActorContext,
  ): Promise<CommentViewDto> {
    return this.comments.create(id, dto, user, actor);
  }

  /** Corrige un comentario propio; queda marcado como editado. */
  @UseGuards(UserThrottlerGuard)
  @SkipThrottle({ auth: true, posts: true })
  @Patch(':commentId')
  edit(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('commentId', ParseUUIDPipe) commentId: string,
    @Body() dto: CommentContentDto,
    @CurrentUser() user: AuthenticatedUser,
    @Actor() actor: ActorContext,
  ): Promise<CommentViewDto> {
    return this.author.edit(id, commentId, dto, user, actor);
  }

  /** Retira un comentario propio (baja lógica: se conserva para auditoría). */
  @Post(':commentId/deactivate')
  @HttpCode(204)
  deactivate(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('commentId', ParseUUIDPipe) commentId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Actor() actor: ActorContext,
  ): Promise<void> {
    return this.author.deactivate(id, commentId, user, actor);
  }
}
