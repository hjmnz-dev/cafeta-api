import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../../common/actor/actor-context.js';
import { CurrentUser } from '../../common/actor/current-user.decorator.js';
import { PageQueryDto } from '../posts/dto/page-query.dto.js';
import {
  NotificationPreferencesDto,
  UpdateNotificationPreferencesDto,
} from './dto/notification-preferences.dto.js';
import {
  NotificationPageDto,
  UnreadCountDto,
} from './dto/notification-view.dto.js';
import { NotificationPreferencesService } from './notification-preferences.service.js';
import { NotificationsReadService } from './notifications-read.service.js';

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly reads: NotificationsReadService,
    private readonly preferences: NotificationPreferencesService,
  ) {}

  /** Mis avisos, del más reciente al más antiguo. */
  @Get()
  list(
    @Query() query: PageQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<NotificationPageDto> {
    return this.reads.list(user.id, query);
  }

  @Get('unread-count')
  unreadCount(@CurrentUser() user: AuthenticatedUser): Promise<UnreadCountDto> {
    return this.reads.unreadCount(user.id);
  }

  @Post('read-all')
  @HttpCode(204)
  markAllRead(@CurrentUser() user: AuthenticatedUser): Promise<void> {
    return this.reads.markAllRead(user.id);
  }

  @Get('preferences')
  getPreferences(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<NotificationPreferencesDto> {
    return this.preferences.get(user.id);
  }

  @Patch('preferences')
  updatePreferences(
    @Body() dto: UpdateNotificationPreferencesDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<NotificationPreferencesDto> {
    return this.preferences.update(user.id, dto);
  }

  @Post(':id/read')
  @HttpCode(204)
  markRead(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    return this.reads.markRead(id, user.id);
  }
}
