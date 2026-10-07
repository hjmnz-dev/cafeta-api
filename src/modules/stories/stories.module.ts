import { Module } from '@nestjs/common';
import { AuditModule } from '../../common/audit/audit.module.js';
import { UploadsModule } from '../uploads/uploads.module.js';
import { VisibilityModule } from '../visibility/visibility.module.js';
import { StoriesReadService } from './stories-read.service.js';
import { StoriesController } from './stories.controller.js';
import { StoriesService } from './stories.service.js';

// Historias de 24 horas (spec 0008, decisión 22).
@Module({
  imports: [AuditModule, UploadsModule, VisibilityModule],
  controllers: [StoriesController],
  providers: [StoriesService, StoriesReadService],
})
export class StoriesModule {}
