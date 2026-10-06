import { Module } from '@nestjs/common';
import { AuditModule } from '../../common/audit/audit.module.js';
import { UploadsModule } from '../uploads/uploads.module.js';
import { PostAuthorService } from './post-author.service.js';
import { PostsReadService } from './posts-read.service.js';
import { PostsController } from './posts.controller.js';
import { PostsService } from './posts.service.js';
import { UserPostsController } from './user-posts.controller.js';
import { VisibilityModule } from '../visibility/visibility.module.js';

// Publicaciones y feed (spec 0005).
@Module({
  imports: [AuditModule, UploadsModule, VisibilityModule],
  controllers: [PostsController, UserPostsController],
  providers: [PostsService, PostsReadService, PostAuthorService],
  exports: [PostsReadService],
})
export class PostsModule {}
