import { Module } from '@nestjs/common';
import { AuditModule } from '../../common/audit/audit.module.js';
import { AccountModule } from '../account/account.module.js';
import { AdminUsersModule } from '../admin-users/admin-users.module.js';
import { PostsModule } from '../posts/posts.module.js';
import { AdminReportResolveService } from './admin-report-resolve.service.js';
import { ReportReviewController } from './report-review.controller.js';
import { AdminReportsReadService } from './admin-reports-read.service.js';
import { ReportClosingService } from './report-closing.service.js';
import { ReportSanctionService } from './report-sanction.service.js';

// Revisión de reportes de la consola (spec 0009, decisión 33).
@Module({
  imports: [AuditModule, AccountModule, AdminUsersModule, PostsModule],
  controllers: [ReportReviewController],
  providers: [
    AdminReportsReadService,
    AdminReportResolveService,
    ReportClosingService,
    ReportSanctionService,
  ],
})
export class ReportReviewModule {}
