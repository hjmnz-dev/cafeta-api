import { Module } from '@nestjs/common';
import { AuditModule } from '../../common/audit/audit.module.js';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { PostsModule } from '../posts/posts.module.js';
import { VisibilityModule } from '../visibility/visibility.module.js';
import { ReportTargetResolver } from './report-target.resolver.js';
import { ReportsController } from './reports.controller.js';
import { ReportsService } from './reports.service.js';

@Module({
  imports: [PrismaModule, AuditModule, PostsModule, VisibilityModule],
  controllers: [ReportsController],
  providers: [ReportsService, ReportTargetResolver],
})
export class ReportsModule {}
