import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Actor } from '../../common/actor/actor.decorator.js';
import type {
  ActorContext,
  AuthenticatedUser,
} from '../../common/actor/actor-context.js';
import { CurrentUser } from '../../common/actor/current-user.decorator.js';
import { CreateStoryDto } from './dto/create-story.dto.js';
import { EditStoryDto } from './dto/edit-story.dto.js';
import { StoryTrayDto, StoryViewDto } from './dto/story-view.dto.js';
import { StoriesReadService } from './stories-read.service.js';
import { StoriesService } from './stories.service.js';
import { StoryEditsService } from './story-edits.service.js';
import { StoryViewsService } from './story-views.service.js';

@ApiTags('stories')
@ApiBearerAuth()
@Controller('stories')
export class StoriesController {
  constructor(
    private readonly stories: StoriesService,
    private readonly edits: StoryEditsService,
    private readonly reads: StoriesReadService,
    private readonly views: StoryViewsService,
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

  /** La marca como vista por mí (bug 1068); repetir no cambia nada. */
  @Post(':id/view')
  @HttpCode(204)
  markViewed(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    return this.views.markViewed(id, user.id);
  }

  /** Corrige el texto de una historia propia vigente; la vigencia no cambia. */
  @Patch(':id')
  edit(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EditStoryDto,
    @CurrentUser() user: AuthenticatedUser,
    @Actor() actor: ActorContext,
  ): Promise<StoryViewDto> {
    return this.edits.edit(id, dto, user, actor);
  }

  /** Desactiva una historia propia vigente (baja lógica, sin reactivar). */
  @Post(':id/deactivate')
  @HttpCode(204)
  deactivate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Actor() actor: ActorContext,
  ): Promise<void> {
    return this.edits.deactivate(id, user, actor);
  }
}
