import { Module } from '@nestjs/common';
import { AuditModule } from '../../common/audit/audit.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { UsersModule } from '../users/users.module.js';
import { AccountController } from './account.controller.js';
import { AccountStateService } from './account-state.service.js';
import { SelfDeactivationService } from './self-deactivation.service.js';

// Estado de la cuenta propia: hoy la baja voluntaria; la 32 y la 33 reusan
// AccountStateService para las bajas de admin (spec 0009).
@Module({
  imports: [AuditModule, AuthModule, UsersModule],
  controllers: [AccountController],
  providers: [AccountStateService, SelfDeactivationService],
  exports: [AccountStateService],
})
export class AccountModule {}
