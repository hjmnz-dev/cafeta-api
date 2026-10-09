import { Module } from '@nestjs/common';
import { PostsModule } from '../posts/posts.module.js';
import { UploadsModule } from '../uploads/uploads.module.js';
import { AnnouncementsController } from './announcements.controller.js';
import { AnnouncementsReadService } from './announcements-read.service.js';
import { AnnouncementsService } from './announcements.service.js';

// Anuncios institucionales de la consola (spec 0009, decisión 36).
@Module({
  imports: [PostsModule, UploadsModule],
  controllers: [AnnouncementsController],
  providers: [AnnouncementsService, AnnouncementsReadService],
})
export class AnnouncementsModule {}
