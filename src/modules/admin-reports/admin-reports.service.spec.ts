import type { ActorContext } from '../../common/actor/actor-context.js';
import type { AuditService } from '../../common/audit/audit.service.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { ActivityReportBuilder } from './activity-report.builder.js';
import { AdminReportsService } from './admin-reports.service.js';
import type { ModerationReportBuilder } from './moderation-report.builder.js';
import type { ReportTable } from './report-table.js';

const ACTOR: ActorContext = {
  userId: 'admin-id',
  role: 'ADMIN',
  ip: '127.0.0.1',
  userAgent: 'vitest',
};
const RANGE = { from: '2026-09-01', to: '2026-09-02' };

function tableOf(kind: ReportTable['kind']): ReportTable {
  return {
    kind,
    title: 'Informe',
    ...RANGE,
    columns: ['Fecha'],
    rows: [['2026-09-01'], ['2026-09-02']],
    isEmpty: false,
  };
}

function makeService() {
  const prisma = {} as PrismaService;
  const audit = { record: vi.fn().mockResolvedValue(undefined) };
  const activity = { build: vi.fn().mockResolvedValue(tableOf('activity')) };
  const moderation = {
    build: vi.fn().mockResolvedValue(tableOf('moderation')),
  };
  const service = new AdminReportsService(
    prisma,
    audit as unknown as AuditService,
    activity as unknown as ActivityReportBuilder,
    moderation as unknown as ModerationReportBuilder,
  );
  return { service, prisma, audit, activity, moderation };
}

describe('AdminReportsService', () => {
  it('elige el generador por tipo y audita report.generate', async () => {
    const { service, prisma, audit, activity, moderation } = makeService();

    const table = await service.generate('moderation', RANGE, ACTOR);

    expect(table.kind).toBe('moderation');
    expect(moderation.build).toHaveBeenCalledOnce();
    expect(activity.build).not.toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(prisma, {
      action: 'report.generate',
      entityType: 'report',
      actor: ACTOR,
      succeeded: true,
      metadata: { kind: 'moderation', ...RANGE, format: 'json', rows: 2 },
    });
  });

  it('el CSV lleva nombre con tipo y rango, BOM, y audita con format csv', async () => {
    const { service, audit } = makeService();

    const file = await service.download('activity', RANGE, ACTOR);

    expect(file.fileName).toBe('cafeta-actividad-2026-09-01-2026-09-02.csv');
    expect(file.content.startsWith('﻿')).toBe(true);
    expect(audit.record).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        metadata: expect.objectContaining({ format: 'csv' }),
      }),
    );
  });

  it('un rango inválido no genera ni audita nada', async () => {
    const { service, audit, activity } = makeService();

    await expect(
      service.generate(
        'activity',
        { from: '2026-09-05', to: '2026-09-01' },
        ACTOR,
      ),
    ).rejects.toMatchObject({ response: { code: 'INVALID_DATE_RANGE' } });

    expect(activity.build).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });
});
