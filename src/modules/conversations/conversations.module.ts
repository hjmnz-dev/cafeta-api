import { Module } from '@nestjs/common';
import { RealtimeModule } from '../realtime/realtime.module.js';
import { UsersModule } from '../users/users.module.js';
import { ConversationsReadService } from './conversations-read.service.js';
import { ConversationsController } from './conversations.controller.js';
import { ConversationsService } from './conversations.service.js';

// Mensajes directos entre dos personas (spec 0008, decisiones 25 y 26).
@Module({
  imports: [UsersModule, RealtimeModule],
  controllers: [ConversationsController],
  providers: [ConversationsService, ConversationsReadService],
})
export class ConversationsModule {}
