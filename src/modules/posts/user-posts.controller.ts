import {
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../../common/actor/actor-context.js';
import { CurrentUser } from '../../common/actor/current-user.decorator.js';
import { PageQueryDto } from './dto/page-query.dto.js';
import { PostCountDto, PostPageDto } from './dto/post-page.dto.js';
import { PostsReadService } from './posts-read.service.js';

// Hoy solo sirve para mi propio perfil; la funcionalidad 14 lo abre a perfiles
// ajenos con las reglas de privacidad.
@ApiTags('posts')
@ApiBearerAuth()
@Controller('users/:userId/posts')
export class UserPostsController {
  constructor(private readonly reads: PostsReadService) {}

  @Get()
  list(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Query() query: PageQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PostPageDto> {
    assertSelf(userId, user);
    return this.reads.byAuthor(userId, query);
  }

  @Get('count')
  count(
    @Param('userId', ParseUUIDPipe) userId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PostCountDto> {
    assertSelf(userId, user);
    return this.reads.countByAuthor(userId);
  }
}

function assertSelf(userId: string, user: AuthenticatedUser): void {
  if (userId !== user.id) {
    throw new ForbiddenException({
      message: 'Solo puedes ver tus propias publicaciones',
      code: 'FORBIDDEN',
    });
  }
}
