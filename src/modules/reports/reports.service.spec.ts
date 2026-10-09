import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import type { ActorContext } from '../../common/actor/actor-context.js';
import type { AuditService } from '../../common/audit/audit.service.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { CreateReportDto } from './dto/create-report.dto.js';
import type { ReportTargetResolver } from './report-target.resolver.js';
import { ReportsService } from './reports.service.js';

const REPORTER = '0192f6a0-0000-7000-8000-000000000001';
const TARGET = '0192f6a0-0000-7000-8000-000000000002';

const actor: ActorContext = {
  userId: REPORTER,
  role: 'STUDENT',
  ip: '127.0.0.1',
  userAgent: 'test-agent',
};

const dto = (over: Partial<CreateReportDto> = {}): CreateReportDto => ({
  targetType: 'USER',
  targetId: TARGET,
  reason: 'SPAM',
  ...over,
});

describe('ReportsService', () => {
  let service: ReportsService;
  let report: { create: ReturnType<typeof vi.fn> };
  let audit: { record: ReturnType<typeof vi.fn> };
  let targets: { resolve: ReturnType<typeof vi.fn> };
  const createdAt = new Date('2026-10-06T12:00:00Z');

  beforeEach(() => {
    report = {
      create: vi.fn().mockResolvedValue({
        id: 'r1',
        targetType: 'USER',
        reason: 'SPAM',
        status: 'PENDING',
        createdAt,
      }),
    };
    const prisma = {
      report,
      $transaction: vi.fn((cb: (tx: unknown) => unknown) => cb({ report })),
    };
    audit = { record: vi.fn().mockResolvedValue(undefined) };
    targets = {
      resolve: vi.fn().mockResolvedValue({
        targetUserId: TARGET,
        targetPostId: null,
        targetSnapshot: null,
        pendingKey: `USER:${TARGET}`,
      }),
    };
    service = new ReportsService(
      prisma as unknown as PrismaService,
      audit as unknown as AuditService,
      targets as unknown as ReportTargetResolver,
    );
  });

  it('guarda el reporte con quien reporta, el objetivo y su llave pendiente', async () => {
    const view = await service.create(REPORTER, dto(), actor);

    expect(report.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          reporterId: REPORTER,
          targetType: 'USER',
          targetUserId: TARGET,
          targetPostId: null,
          targetSnapshot: null,
          reason: 'SPAM',
          details: null,
          pendingKey: `USER:${TARGET}`,
        },
      }),
    );
    expect(view).toEqual({
      id: 'r1',
      targetType: 'USER',
      targetId: TARGET,
      reason: 'SPAM',
      status: 'PENDING',
      createdAt,
    });
  });

  it('audita report.create en la misma transacción', async () => {
    await service.create(REPORTER, dto(), actor);

    expect(audit.record).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: 'report.create',
        entityType: 'report',
        entityId: 'r1',
        actor,
        metadata: { targetType: 'USER', targetId: TARGET, reason: 'SPAM' },
      }),
    );
  });

  it('exige detalle cuando el motivo es OTHER y no consulta el objetivo', async () => {
    await expect(
      service.create(REPORTER, dto({ reason: 'OTHER' }), actor),
    ).rejects.toThrow(BadRequestException);
    expect(targets.resolve).not.toHaveBeenCalled();
    expect(report.create).not.toHaveBeenCalled();
  });

  it('acepta OTHER con detalle y lo guarda', async () => {
    await service.create(
      REPORTER,
      dto({ reason: 'OTHER', details: 'Me escribe a todas horas' }),
      actor,
    );

    expect(report.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ details: 'Me escribe a todas horas' }),
      }),
    );
  });

  it('responde 409 REPORT_ALREADY_PENDING si la base rechaza el duplicado', async () => {
    report.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('duplicado', {
        code: 'P2002',
        clientVersion: '7.0.0',
      }),
    );

    const attempt = service.create(REPORTER, dto(), actor);

    await expect(attempt).rejects.toThrow(ConflictException);
    await expect(attempt).rejects.toMatchObject({
      response: { code: 'REPORT_ALREADY_PENDING' },
    });
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('deja pasar cualquier otro error de la base sin disfrazarlo', async () => {
    const boom = new Error('se cayó la base');
    report.create.mockRejectedValue(boom);

    await expect(service.create(REPORTER, dto(), actor)).rejects.toBe(boom);
  });

  it('propaga el rechazo del objetivo (404 o 400) sin escribir nada', async () => {
    const rejection = new BadRequestException('no');
    targets.resolve.mockRejectedValue(rejection);

    await expect(service.create(REPORTER, dto(), actor)).rejects.toBe(
      rejection,
    );
    expect(report.create).not.toHaveBeenCalled();
  });
});
