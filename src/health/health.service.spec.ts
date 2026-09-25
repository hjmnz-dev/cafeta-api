import { ServiceUnavailableException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service.js';
import { HealthService } from './health.service.js';

describe('HealthService', () => {
  const prisma = { $queryRaw: vi.fn() };
  let service: HealthService;

  beforeEach(async () => {
    prisma.$queryRaw.mockReset();
    const moduleRef = await Test.createTestingModule({
      providers: [HealthService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(HealthService);
  });

  it('responde ok cuando la base contesta', async () => {
    prisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
    await expect(service.check()).resolves.toEqual({ status: 'ok', db: 'up' });
  });

  it('lanza 503 con code DATABASE_UNAVAILABLE cuando la base no contesta', async () => {
    prisma.$queryRaw.mockRejectedValue(new Error('connect ECONNREFUSED'));
    const error = await service.check().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ServiceUnavailableException);
    expect((error as ServiceUnavailableException).getResponse()).toMatchObject({
      code: 'DATABASE_UNAVAILABLE',
    });
  });
});
