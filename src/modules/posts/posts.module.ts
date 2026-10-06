import { Module } from '@nestjs/common';
import { AuditModule } from '../../common/audit/audit.module.js';
import { UploadsModule } from '../uploads/uploads.module.js';
import { PostsReadService } from './posts-read.service.js';
import { PostsController } from './posts.controller.js';
import { PostsService } from './posts.service.js';
import { UserPostsController } from './user-posts.controller.js';

// Publicaciones y feed (spec 0005).
@Module({
  imports: [AuditModule, UploadsModule],
  controllers: [PostsController, UserPostsController],
  providers: [PostsService, PostsReadService],
  exports: [PostsReadService],
})
export class PostsModule {}
