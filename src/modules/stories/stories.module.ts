import { Module } from '@nestjs/common';
import { AuditModule } from '../../common/audit/audit.module.js';
import { UploadsModule } from '../uploads/uploads.module.js';
import { VisibilityModule } from '../visibility/visibility.module.js';
import { StoriesReadService } from './stories-read.service.js';
import { StoryAccessService } from './story-access.service.js';
import { StoriesController } from './stories.controller.js';
import { StoriesService } from './stories.service.js';
import { StoryEditsService } from './story-edits.service.js';
import { StoryViewsService } from './story-views.service.js';

// Historias de 24 horas (spec 0008, decisión 22; editar y desactivar, spec 0009,
// decisión 23). Exporta StoryAccessService: reacciones y comentarios (decisión
// 24) le preguntan quién puede ver una historia.
@Module({
  imports: [AuditModule, UploadsModule, VisibilityModule],
  controllers: [StoriesController],
  providers: [
    StoriesService,
    StoryEditsService,
    StoriesReadService,
    StoryAccessService,
    StoryViewsService,
  ],
  exports: [StoryAccessService],
})
export class StoriesModule {}
