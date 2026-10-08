import { Module } from '@nestjs/common';
import { AuditModule } from '../../common/audit/audit.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { UploadsModule } from '../uploads/uploads.module.js';
import { VisibilityModule } from '../visibility/visibility.module.js';
import { PostAccessService } from './post-access.service.js';
import { PostCommentAuthorService } from './post-comment-author.service.js';
import { PostCommentsController } from './post-comments.controller.js';
import { PostCommentsService } from './post-comments.service.js';

// Comentarios en publicaciones (spec 0009, decisión 21).
@Module({
  imports: [AuditModule, NotificationsModule, UploadsModule, VisibilityModule],
  controllers: [PostCommentsController],
  providers: [PostCommentsService, PostCommentAuthorService, PostAccessService],
})
export class PostCommentsModule {}
