import { Module } from '@nestjs/common';
import { AuditModule } from '../../common/audit/audit.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { RealtimeModule } from '../realtime/realtime.module.js';
import { UsersModule } from '../users/users.module.js';
import { ConversationsReadService } from './conversations-read.service.js';
import { ConversationsController } from './conversations.controller.js';
import { ConversationsService } from './conversations.service.js';
import { MessageEditsService } from './message-edits.service.js';
import { UploadsModule } from '../uploads/uploads.module.js';

// Mensajes directos entre dos personas (spec 0008, decisiones 25 y 26).
@Module({
  imports: [
    UsersModule,
    RealtimeModule,
    AuditModule,
    NotificationsModule,
    UploadsModule,
  ],
  controllers: [ConversationsController],
  providers: [
    ConversationsService,
    ConversationsReadService,
    MessageEditsService,
  ],
})
export class ConversationsModule {}
