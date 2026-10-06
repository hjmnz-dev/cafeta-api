import {
  Controller,
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
import type { FollowRequestPageDto } from './dto/follow-view.dto.js';
import { FollowsService } from './follows.service.js';

@ApiTags('follows')
@ApiBearerAuth()
@Controller('follows')
export class FollowsController {
  constructor(private readonly follows: FollowsService) {}

  /** Lista de solicitudes de seguimiento recibidas y pendientes. */
  @Get('requests')
  pendingRequests(
    @Query() query: PageQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<FollowRequestPageDto> {
    return this.follows.pendingRequests(user.id, query);
  }

  /** Aceptar una solicitud de seguimiento. */
  @Post(':id/accept')
  @HttpCode(204)
  accept(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Actor() actor: ActorContext,
  ): Promise<void> {
    return this.follows.accept(id, user.id, actor);
  }

  /** Rechazar una solicitud de seguimiento. */
  @Post(':id/reject')
  @HttpCode(204)
  reject(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Actor() actor: ActorContext,
  ): Promise<void> {
    return this.follows.reject(id, user.id, actor);
  }
}
