import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from './config/env.validation.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { HealthModule } from './health/health.module.js';
import { AuditModule } from './common/audit/audit.module.js';
import { HttpExceptionFilter } from './common/filters/http-exception.filter.js';
import { AccountModule } from './modules/account/account.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { CareersModule } from './modules/careers/careers.module.js';
import { PostsModule } from './modules/posts/posts.module.js';
import { MailModule } from './common/mail/mail.module.js';
import { PasswordResetModule } from './modules/password-reset/password-reset.module.js';
import { RateLimitModule } from './common/rate-limit/rate-limit.module.js';
import { UploadsModule } from './modules/uploads/uploads.module.js';
import { ConversationsModule } from './modules/conversations/conversations.module.js';
import { ProfilesModule } from './modules/profiles/profiles.module.js';
import { MonitoringModule } from './common/monitoring/monitoring.module.js';
import { MonitoringTestModule } from './modules/monitoring/monitoring.module.js';
import { FollowsModule } from './modules/follows/follows.module.js';
import { BlocksModule } from './modules/blocks/blocks.module.js';
import { ReportsModule } from './modules/reports/reports.module.js';
import { SearchModule } from './modules/search/search.module.js';
import { NotificationsModule } from './modules/notifications/notifications.module.js';
import { PostReactionsModule } from './modules/post-reactions/post-reactions.module.js';
import { AdminDashboardModule } from './modules/admin-dashboard/admin-dashboard.module.js';
import { AdminReportsModule } from './modules/admin-reports/admin-reports.module.js';
import { AdminAuditModule } from './modules/admin-audit/admin-audit.module.js';
import { AnnouncementsModule } from './modules/announcements/announcements.module.js';
import { ReportReviewModule } from './modules/report-review/report-review.module.js';
import { AdminUsersModule } from './modules/admin-users/admin-users.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: process.env.NODE_ENV === 'test' ? '.env.test' : '.env',
      validate: validateEnv,
    }),
    PrismaModule,
    AuditModule,
    RateLimitModule,
    HealthModule,
    CareersModule,
    AuthModule,
    PostsModule,
    MailModule,
    MonitoringModule,
    MonitoringTestModule,
    ProfilesModule,
    ConversationsModule,
    UploadsModule,
    FollowsModule,
    BlocksModule,
    SearchModule,
    NotificationsModule,
    AccountModule,
    PostReactionsModule,
    ReportsModule,
    PasswordResetModule,
    AdminDashboardModule,
    AdminAuditModule,
    AnnouncementsModule,
    AdminUsersModule,
    AdminReportsModule,
    ReportReviewModule,
  ],
  providers: [{ provide: APP_FILTER, useClass: HttpExceptionFilter }],
})
export class AppModule {}
