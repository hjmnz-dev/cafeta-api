import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../../common/actor/actor-context.js';
import { CurrentUser } from '../../common/actor/current-user.decorator.js';
import { PageQueryDto } from '../posts/dto/page-query.dto.js';
import { PostReactorPageDto } from './dto/post-reactor.dto.js';
import { PostReactorsService } from './post-reactors.service.js';

@ApiTags('post-reactions')
@ApiBearerAuth()
@Controller('posts/:id/reactions')
export class PostReactorsController {
  constructor(private readonly reactors: PostReactorsService) {}

  /** Quién reaccionó a mi publicación y con qué; solo para su autor. */
  @Get()
  list(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: PageQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PostReactorPageDto> {
    return this.reactors.list(id, query, user.id);
  }
}
