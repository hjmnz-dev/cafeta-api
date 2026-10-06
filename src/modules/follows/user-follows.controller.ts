import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Actor } from '../../common/actor/actor.decorator.js';
import type {
  ActorContext,
  AuthenticatedUser,
} from '../../common/actor/actor-context.js';
import { CurrentUser } from '../../common/actor/current-user.decorator.js';
import { PageQueryDto } from '../posts/dto/page-query.dto.js';
import type {
  FollowStatusViewDto,
  FollowUserPageDto,
} from './dto/follow-view.dto.js';
import { FollowsService } from './follows.service.js';

@ApiTags('follows')
@ApiBearerAuth()
@Controller('users/:userId')
export class UserFollowsController {
  constructor(private readonly follows: FollowsService) {}

  /** Seguir a un usuario o enviar solicitud si su perfil es limitado. */
  @Post('follow')
  follow(
    @Param('userId', ParseUUIDPipe) userId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Actor() actor: ActorContext,
  ): Promise<FollowStatusViewDto> {
    return this.follows.follow(userId, user.id, actor);
  }

  /** Dejar de seguir o cancelar una solicitud pendiente. */
  @Delete('follow')
  @HttpCode(204)
  unfollow(
    @Param('userId', ParseUUIDPipe) userId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Actor() actor: ActorContext,
  ): Promise<void> {
    return this.follows.unfollow(userId, user.id, actor);
  }

  /** Lista paginada de seguidores de un usuario. */
  @Get('followers')
  followers(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Query() query: PageQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<FollowUserPageDto> {
    return this.follows.followers(userId, user.id, query);
  }

  /** Lista paginada de seguidos de un usuario. */
  @Get('following')
  following(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Query() query: PageQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<FollowUserPageDto> {
    return this.follows.following(userId, user.id, query);
  }
}
