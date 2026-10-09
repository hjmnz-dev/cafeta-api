import type { PrismaService } from '../../prisma/prisma.service.js';
import { AdminDashboardService } from './admin-dashboard.service.js';

const NOW = new Date('2026-10-07T12:00:00.000Z');

function makePrisma() {
  const count = () => vi.fn().mockResolvedValue(0);
  return {
    user: { count: count() },
    post: { count: count() },
    story: { count: count() },
    report: { count: count() },
  };
}

describe('AdminDashboardService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => vi.useRealTimers());

  it('cuenta solo estudiantes activos y mide los 7 días desde ahora', async () => {
    const prisma = makePrisma();
    const service = new AdminDashboardService(
      prisma as unknown as PrismaService,
    );

    await service.metrics();

    const since = new Date('2026-09-30T12:00:00.000Z');
    expect(prisma.user.count).toHaveBeenCalledWith({
      where: { role: 'STUDENT', deactivatedAt: null },
    });
    expect(prisma.user.count).toHaveBeenCalledWith({
      where: {
        role: 'STUDENT',
        deactivatedAt: null,
        createdAt: { gte: since },
      },
    });
    expect(prisma.story.count).toHaveBeenCalledWith({
      where: { deactivatedAt: null, expiresAt: { gt: NOW } },
    });
    expect(prisma.report.count).toHaveBeenCalledWith({
      where: { status: 'PENDING' },
    });
  });

  it('arma la respuesta con cada conteo en su lugar', async () => {
    const prisma = makePrisma();
    prisma.user.count
      .mockResolvedValueOnce(10)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(4);
    prisma.post.count.mockResolvedValueOnce(20).mockResolvedValueOnce(6);
    prisma.story.count.mockResolvedValue(2);
    prisma.report.count.mockResolvedValue(5);
    const service = new AdminDashboardService(
      prisma as unknown as PrismaService,
    );

    expect(await service.metrics()).toEqual({
      generatedAt: NOW.toISOString(),
      users: { total: 10, last7Days: 3 },
      posts: { total: 20, last7Days: 6 },
      activeStories: 2,
      pendingReports: 5,
      pendingVerifications: 4,
    });
  });
});
