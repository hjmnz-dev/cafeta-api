import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Actor } from '../../common/actor/actor.decorator.js';
import type {
  ActorContext,
  AuthenticatedUser,
} from '../../common/actor/actor-context.js';
import { CurrentUser } from '../../common/actor/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { PageQueryDto } from '../posts/dto/page-query.dto.js';
import { PostViewDto } from '../posts/dto/post-view.dto.js';
import { AnnouncementsReadService } from './announcements-read.service.js';
import { AnnouncementsService } from './announcements.service.js';
import { AdminAnnouncementPageDto } from './dto/admin-announcement-view.dto.js';
import { CreateAnnouncementDto } from './dto/create-announcement.dto.js';

@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin/announcements')
@Roles('ADMIN')
@UseGuards(RolesGuard)
@ApiForbiddenResponse({ description: 'No es admin: FORBIDDEN' })
export class AnnouncementsController {
  constructor(
    private readonly announcements: AnnouncementsService,
    private readonly reads: AnnouncementsReadService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Publicar un anuncio oficial (solo admin)' })
  @ApiCreatedResponse({ type: PostViewDto })
  @ApiBadRequestResponse({
    description:
      'Texto vacío (POST_CONTENT_REQUIRED), adjunto ajeno (MEDIA_NOT_FOUND) o combinación inválida (MEDIA_COMBINATION_INVALID)',
  })
  create(
    @Body() dto: CreateAnnouncementDto,
    @CurrentUser() user: AuthenticatedUser,
    @Actor() actor: ActorContext,
  ): Promise<PostViewDto> {
    return this.announcements.create(dto, user, actor);
  }

  @Get()
  @ApiOperation({
    summary: 'Todos los anuncios, activos y desactivados (solo admin)',
  })
  @ApiOkResponse({ type: AdminAnnouncementPageDto })
  list(@Query() query: PageQueryDto): Promise<AdminAnnouncementPageDto> {
    return this.reads.list(query);
  }
}
