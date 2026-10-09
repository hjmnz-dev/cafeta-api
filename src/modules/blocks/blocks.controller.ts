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
import { BlocksService } from './blocks.service.js';
import type {
  BlockedUserPageDto,
  BlockStatusViewDto,
} from './dto/block-view.dto.js';

@ApiTags('blocks')
@ApiBearerAuth()
@Controller()
export class BlocksController {
  constructor(private readonly blocks: BlocksService) {}

  /** Lista paginada de usuarios bloqueados por el usuario autenticado. */
  @Get('blocks')
  blockedUsers(
    @Query() query: PageQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<BlockedUserPageDto> {
    return this.blocks.blockedUsers(user.id, query);
  }

  /** Bloquear a un usuario. */
  @Post('users/:userId/block')
  @HttpCode(200)
  block(
    @Param('userId', ParseUUIDPipe) userId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Actor() actor: ActorContext,
  ): Promise<BlockStatusViewDto> {
    return this.blocks.block(userId, user.id, actor);
  }

  /** Desbloquear a un usuario. */
  @Delete('users/:userId/block')
  @HttpCode(204)
  unblock(
    @Param('userId', ParseUUIDPipe) userId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Actor() actor: ActorContext,
  ): Promise<void> {
    return this.blocks.unblock(userId, user.id, actor);
  }
}
