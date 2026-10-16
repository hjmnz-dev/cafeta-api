import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { PostsModule } from '../posts/posts.module.js';
import { UploadsModule } from '../uploads/uploads.module.js';
import { VisibilityModule } from '../visibility/visibility.module.js';
import { PostReactionsController } from './post-reactions.controller.js';
import { PostReactionsService } from './post-reactions.service.js';
import { PostReactorsController } from './post-reactors.controller.js';
import { PostReactorsService } from './post-reactors.service.js';

// Reacciones a publicaciones (spec 0009, decisión 20).
@Module({
  imports: [VisibilityModule, NotificationsModule, PostsModule, UploadsModule],
  controllers: [PostReactionsController, PostReactorsController],
  providers: [PostReactionsService, PostReactorsService],
})
export class PostReactionsModule {}
