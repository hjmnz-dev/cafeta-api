import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Actor } from '../../common/actor/actor.decorator.js';
import type {
  ActorContext,
  AuthenticatedUser,
} from '../../common/actor/actor-context.js';
import { CurrentUser } from '../../common/actor/current-user.decorator.js';
import { CreateStoryDto } from './dto/create-story.dto.js';
import { StoryTrayDto, StoryViewDto } from './dto/story-view.dto.js';
import { StoriesReadService } from './stories-read.service.js';
import { StoriesService } from './stories.service.js';

@ApiTags('stories')
@ApiBearerAuth()
@Controller('stories')
export class StoriesController {
  constructor(
    private readonly stories: StoriesService,
    private readonly reads: StoriesReadService,
  ) {}

  @Post()
  create(
    @Body() dto: CreateStoryDto,
    @CurrentUser() user: AuthenticatedUser,
    @Actor() actor: ActorContext,
  ): Promise<StoryViewDto> {
    return this.stories.create(dto, user, actor);
  }

  // Historias vigentes de quienes sigo y las mías, agrupadas por autor.
  @Get()
  tray(@CurrentUser() user: AuthenticatedUser): Promise<StoryTrayDto> {
    return this.reads.tray(user.id);
  }
}
