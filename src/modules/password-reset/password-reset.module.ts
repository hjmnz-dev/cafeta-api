import { Module } from '@nestjs/common';
import { AuditModule } from '../../common/audit/audit.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { UsersModule } from '../users/users.module.js';
import { PasswordResetController } from './password-reset.controller.js';
import { PasswordResetService } from './password-reset.service.js';
import { ResetTokensService } from './reset-tokens.service.js';

// Recuperar la contraseña por correo (spec 0008, decisión 10).
@Module({
  imports: [AuditModule, AuthModule, UsersModule],
  controllers: [PasswordResetController],
  providers: [PasswordResetService, ResetTokensService],
})
export class PasswordResetModule {}
