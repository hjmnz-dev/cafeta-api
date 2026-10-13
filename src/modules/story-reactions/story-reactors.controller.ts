import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../../common/actor/actor-context.js';
import { CurrentUser } from '../../common/actor/current-user.decorator.js';
import { PageQueryDto } from '../posts/dto/page-query.dto.js';
import { StoryReactorPageDto } from './dto/story-reactor.dto.js';
import { StoryReactorsService } from './story-reactors.service.js';

@ApiTags('story-reactions')
@ApiBearerAuth()
@Controller('stories/:id/reactions')
export class StoryReactorsController {
  constructor(private readonly reactors: StoryReactorsService) {}

  /** Quién reaccionó a mi historia y con qué; solo para su autor. */
  @Get()
  list(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: PageQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<StoryReactorPageDto> {
    return this.reactors.list(id, query, user.id);
  }
}
