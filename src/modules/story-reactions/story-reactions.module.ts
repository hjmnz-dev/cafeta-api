import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { StoriesModule } from '../stories/stories.module.js';
import { UploadsModule } from '../uploads/uploads.module.js';
import { StoryReactionsController } from './story-reactions.controller.js';
import { StoryReactionsService } from './story-reactions.service.js';
import { StoryReactorsController } from './story-reactors.controller.js';
import { StoryReactorsService } from './story-reactors.service.js';

// Reacciones a historias (spec 0009, decisión 24).
@Module({
  imports: [StoriesModule, NotificationsModule, UploadsModule],
  controllers: [StoryReactionsController, StoryReactorsController],
  providers: [StoryReactionsService, StoryReactorsService],
})
export class StoryReactionsModule {}
