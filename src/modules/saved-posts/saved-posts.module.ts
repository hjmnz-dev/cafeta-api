import { Module } from '@nestjs/common';
import { PostsModule } from '../posts/posts.module.js';
import { UploadsModule } from '../uploads/uploads.module.js';
import { VisibilityModule } from '../visibility/visibility.module.js';
import { SavedPostsReadService } from './saved-posts-read.service.js';
import { SavedPostsController } from './saved-posts.controller.js';
import { SavedPostsService } from './saved-posts.service.js';

// Guardar publicaciones (spec 0009, decisión 19).
@Module({
  imports: [PostsModule, UploadsModule, VisibilityModule],
  controllers: [SavedPostsController],
  providers: [SavedPostsService, SavedPostsReadService],
})
export class SavedPostsModule {}
