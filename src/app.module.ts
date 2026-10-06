import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from './config/env.validation.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { HealthModule } from './health/health.module.js';
import { AuditModule } from './common/audit/audit.module.js';
import { HttpExceptionFilter } from './common/filters/http-exception.filter.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { CareersModule } from './modules/careers/careers.module.js';
import { PostsModule } from './modules/posts/posts.module.js';
import { RateLimitModule } from './common/rate-limit/rate-limit.module.js';
import { ConversationsModule } from './modules/conversations/conversations.module.js';
import { ProfilesModule } from './modules/profiles/profiles.module.js';
import { MonitoringModule } from './common/monitoring/monitoring.module.js';
import { MonitoringTestModule } from './modules/monitoring/monitoring.module.js';

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
    MonitoringModule,
    MonitoringTestModule,
    ProfilesModule,
    ConversationsModule,
  ],
  providers: [{ provide: APP_FILTER, useClass: HttpExceptionFilter }],
})
export class AppModule {}
