import { Module } from '@nestjs/common';
import { AdminAuditController } from './admin-audit.controller.js';
import { AdminAuditReadService } from './admin-audit-read.service.js';

// Bitácora de auditoría de la consola (spec 0009, decisión 34). No importa
// AuditModule: solo lee la tabla, nunca escribe en ella.
@Module({
  controllers: [AdminAuditController],
  providers: [AdminAuditReadService],
})
export class AdminAuditModule {}
