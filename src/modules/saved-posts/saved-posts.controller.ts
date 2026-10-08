import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../../common/actor/actor-context.js';
import { CurrentUser } from '../../common/actor/current-user.decorator.js';
import { PageQueryDto } from '../posts/dto/page-query.dto.js';
import { PostPageDto } from '../posts/dto/post-page.dto.js';
import { SavedPostsReadService } from './saved-posts-read.service.js';
import { SavedPostsService } from './saved-posts.service.js';

@ApiTags('saved-posts')
@ApiBearerAuth()
@Controller()
export class SavedPostsController {
  constructor(
    private readonly saved: SavedPostsService,
    private readonly reads: SavedPostsReadService,
  ) {}

  /** Guarda la publicación de otra persona; guardarla dos veces deja una sola. */
  @Put('posts/:id/save')
  @HttpCode(204)
  save(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    return this.saved.save(id, user.id);
  }

  /** La quita de mi lista sin tocar la publicación; si no estaba, no falla. */
  @Delete('posts/:id/save')
  @HttpCode(204)
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    return this.saved.remove(id, user.id);
  }

  /** Mis guardadas, la más reciente primero. */
  @Get('me/saved')
  list(
    @Query() query: PageQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PostPageDto> {
    return this.reads.list(user.id, query);
  }
}
