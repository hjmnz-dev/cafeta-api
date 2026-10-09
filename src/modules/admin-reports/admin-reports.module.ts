import { Module } from '@nestjs/common';
import { AuditModule } from '../../common/audit/audit.module.js';
import { ActivityReportBuilder } from './activity-report.builder.js';
import { AdminReportsController } from './admin-reports.controller.js';
import { AdminReportsService } from './admin-reports.service.js';
import { ModerationReportBuilder } from './moderation-report.builder.js';

@Module({
  imports: [AuditModule],
  controllers: [AdminReportsController],
  providers: [
    AdminReportsService,
    ActivityReportBuilder,
    ModerationReportBuilder,
  ],
})
export class AdminReportsModule {}
