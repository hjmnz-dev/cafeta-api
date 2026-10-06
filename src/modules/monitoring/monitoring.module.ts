import { Module } from '@nestjs/common';
import { AuditModule } from '../../common/audit/audit.module.js';
import { MonitoringController } from './monitoring.controller.js';
import { MonitoringService } from './monitoring.service.js';

// Endpoint de prueba del monitoreo (spec 0007). La captura vive en
// common/monitoring, no aquí.
@Module({
  imports: [AuditModule],
  controllers: [MonitoringController],
  providers: [MonitoringService],
})
export class MonitoringTestModule {}
