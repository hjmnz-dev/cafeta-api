import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { VisibilityModule } from '../visibility/visibility.module.js';
import { PostReactionsController } from './post-reactions.controller.js';
import { PostReactionsService } from './post-reactions.service.js';

// Reacciones a publicaciones (spec 0009, decisión 20).
@Module({
  imports: [VisibilityModule, NotificationsModule],
  controllers: [PostReactionsController],
  providers: [PostReactionsService],
})
export class PostReactionsModule {}
