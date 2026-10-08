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
import { SetReactionDto } from '../post-reactions/dto/set-reaction.dto.js';
import { StoryReactionStateDto } from './dto/story-reaction-state.dto.js';
import { StoryReactionsService } from './story-reactions.service.js';

@ApiTags('story-reactions')
@ApiBearerAuth()
@Controller('stories/:id/reaction')
export class StoryReactionsController {
  constructor(private readonly reactions: StoryReactionsService) {}

  /** Pone mi reacción: la crea, la reactiva o cambia su tipo. */
  @Put()
  @HttpCode(200)
  set(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetReactionDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<StoryReactionStateDto> {
    return this.reactions.set(id, dto.type, user.id);
  }

  /** Quita mi reacción; si no tenía, no falla. */
  @Delete()
  @HttpCode(200)
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<StoryReactionStateDto> {
    return this.reactions.remove(id, user.id);
  }
}
