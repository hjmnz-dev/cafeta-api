import { Module } from '@nestjs/common';
import { AuditModule } from '../../common/audit/audit.module.js';
import { AccountModule } from '../account/account.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { UsersModule } from '../users/users.module.js';
import { AdminTargetService } from './admin-target.service.js';
import { AdminUserActionsService } from './admin-user-actions.service.js';
import { AdminUserVerificationService } from './admin-user-verification.service.js';
import { AdminUsersController } from './admin-users.controller.js';
import { AdminUsersReadService } from './admin-users-read.service.js';

// Gestión de usuarios de la consola (spec 0009, decisión 32).
@Module({
  imports: [AuditModule, AccountModule, NotificationsModule, UsersModule],
  controllers: [AdminUsersController],
  providers: [
    AdminTargetService,
    AdminUserActionsService,
    AdminUserVerificationService,
    AdminUsersReadService,
  ],
  exports: [AdminTargetService],
})
export class AdminUsersModule {}
