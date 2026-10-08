import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { StoriesModule } from '../stories/stories.module.js';
import { StoryReactionsController } from './story-reactions.controller.js';
import { StoryReactionsService } from './story-reactions.service.js';

// Reacciones a historias (spec 0009, decisión 24).
@Module({
  imports: [StoriesModule, NotificationsModule],
  controllers: [StoryReactionsController],
  providers: [StoryReactionsService],
})
export class StoryReactionsModule {}
