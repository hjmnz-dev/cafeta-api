import { Module } from '@nestjs/common';
import { RealtimeModule } from '../realtime/realtime.module.js';
import { VisibilityModule } from '../visibility/visibility.module.js';
import { NotificationPreferencesService } from './notification-preferences.service.js';
import { NotificationsReadService } from './notifications-read.service.js';
import { NotificationsController } from './notifications.controller.js';
import { NotificationsService } from './notifications.service.js';

// Notificaciones y preferencias (spec 0008, decisión 27). Los demás módulos
// importan este para llamar a NotificationsService.notify().
@Module({
  imports: [RealtimeModule, VisibilityModule],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationsReadService,
    NotificationPreferencesService,
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
