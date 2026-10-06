import { Module } from '@nestjs/common';
import { AuditModule } from '../../common/audit/audit.module.js';
import { UploadsModule } from '../uploads/uploads.module.js';
import { VisibilityModule } from '../visibility/visibility.module.js';
import { FollowsController } from './follows.controller.js';
import { FollowsService } from './follows.service.js';
import { UserFollowsController } from './user-follows.controller.js';

// Seguimientos (decisión 16).
@Module({
  imports: [VisibilityModule, UploadsModule, AuditModule],
  controllers: [FollowsController, UserFollowsController],
  providers: [FollowsService],
  exports: [FollowsService],
})
export class FollowsModule {}
