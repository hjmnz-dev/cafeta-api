import { Module } from '@nestjs/common';
import { AuditModule } from '../../common/audit/audit.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { StoriesModule } from '../stories/stories.module.js';
import { UploadsModule } from '../uploads/uploads.module.js';
import { VisibilityModule } from '../visibility/visibility.module.js';
import { StoryCommentAuthorService } from './story-comment-author.service.js';
import { StoryCommentsController } from './story-comments.controller.js';
import { StoryCommentsService } from './story-comments.service.js';

// Comentarios en historias (spec 0009, decisión 24).
@Module({
  imports: [
    AuditModule,
    NotificationsModule,
    StoriesModule,
    UploadsModule,
    VisibilityModule,
  ],
  controllers: [StoryCommentsController],
  providers: [StoryCommentsService, StoryCommentAuthorService],
})
export class StoryCommentsModule {}
