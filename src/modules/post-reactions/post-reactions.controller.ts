import {
  Body,
  Controller,
  Delete,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Put,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../../common/actor/actor-context.js';
import { CurrentUser } from '../../common/actor/current-user.decorator.js';
import { ReactionStateDto } from './dto/reaction-state.dto.js';
import { SetReactionDto } from './dto/set-reaction.dto.js';
import { PostReactionsService } from './post-reactions.service.js';

@ApiTags('post-reactions')
@ApiBearerAuth()
@Controller('posts/:id/reaction')
export class PostReactionsController {
  constructor(private readonly reactions: PostReactionsService) {}

  /** Pone mi reacción: la crea, la reactiva o cambia su tipo. */
  @Put()
  @HttpCode(200)
  set(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetReactionDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ReactionStateDto> {
    return this.reactions.set(id, dto.type, user.id);
  }

  /** Quita mi reacción; si no tenía, no falla. */
  @Delete()
  @HttpCode(200)
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ReactionStateDto> {
    return this.reactions.remove(id, user.id);
  }
}
