import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ACTIVE } from '../../common/soft-delete/soft-delete.js';
import { VISIBLE_POST } from '../posts/post-queries.js';
import type { DashboardMetricsDto } from './dto/dashboard-metrics.dto.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const RECENT_DAYS = 7;

// Métricas del dashboard (spec 0008, decisión 31): conteos al momento, sin
// caché, con los índices que ya existen.
@Injectable()
export class AdminDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async metrics(): Promise<DashboardMetricsDto> {
    const now = new Date();
    const since = new Date(now.getTime() - RECENT_DAYS * DAY_MS);
    const activeStudents = { role: 'STUDENT', ...ACTIVE } as const;

    const [
      users,
      newUsers,
      posts,
      newPosts,
      activeStories,
      pendingReports,
      pendingVerifications,
    ] = await Promise.all([
      this.prisma.user.count({ where: activeStudents }),
      this.prisma.user.count({
        where: { ...activeStudents, createdAt: { gte: since } },
      }),
      this.prisma.post.count({ where: VISIBLE_POST }),
      this.prisma.post.count({
        where: { ...VISIBLE_POST, createdAt: { gte: since } },
      }),
      this.prisma.story.count({
        where: { ...ACTIVE, expiresAt: { gt: now } },
      }),
      this.prisma.report.count({ where: { status: 'PENDING' } }),
      this.prisma.user.count({
        where: { ...activeStudents, verificationStatus: 'PENDING' },
      }),
    ]);

    return {
      generatedAt: now.toISOString(),
      users: { total: users, last7Days: newUsers },
      posts: { total: posts, last7Days: newPosts },
      activeStories,
      pendingReports,
      pendingVerifications,
    };
  }
}
