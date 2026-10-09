import {
  adminReportsWhere,
  afterReport,
  reportOrder,
  sameTarget,
} from './admin-report-queries.js';

// La cola de reportes y su paginación (spec 0009, decisión 33).
describe('sameTarget', () => {
  it('un reporte de usuario comparte el usuario', () => {
    expect(sameTarget({ targetUserId: 'u1', targetPostId: null })).toEqual({
      targetUserId: 'u1',
    });
  });

  it('un reporte de publicación comparte la publicación', () => {
    expect(sameTarget({ targetUserId: null, targetPostId: 'p1' })).toEqual({
      targetPostId: 'p1',
    });
  });

  it('sin objetivo (publicación borrada) no comparte con nadie: null, nunca "es null"', () => {
    expect(sameTarget({ targetUserId: null, targetPostId: null })).toBeNull();
  });
});

describe('adminReportsWhere y reportOrder', () => {
  it('filtra por estado y, si se pide, por tipo', () => {
    expect(adminReportsWhere({ status: 'PENDING' })).toEqual({
      status: 'PENDING',
    });
    expect(
      adminReportsWhere({ status: 'DISMISSED', targetType: 'POST' }),
    ).toEqual({ status: 'DISMISSED', targetType: 'POST' });
  });

  it('los pendientes van del más antiguo y los resueltos del más reciente', () => {
    expect(reportOrder('PENDING')).toEqual([
      { createdAt: 'asc' },
      { id: 'asc' },
    ]);
    expect(reportOrder('SANCTIONED')).toEqual([
      { resolvedAt: 'desc' },
      { id: 'desc' },
    ]);
  });
});

describe('afterReport', () => {
  const at = new Date('2026-10-01T10:00:00.000Z');

  it('en la cola de pendientes sigue con lo más nuevo', () => {
    expect(
      afterReport('PENDING', { createdAt: at, resolvedAt: null }, 'r1'),
    ).toEqual({
      OR: [{ createdAt: { gt: at } }, { createdAt: at, id: { gt: 'r1' } }],
    });
  });

  it('en los resueltos sigue con lo más viejo, por fecha de resolución', () => {
    const resolvedAt = new Date('2026-10-02T10:00:00.000Z');
    expect(
      afterReport('DISMISSED', { createdAt: at, resolvedAt }, 'r1'),
    ).toEqual({
      OR: [
        { resolvedAt: { lt: resolvedAt } },
        { resolvedAt, id: { lt: 'r1' } },
      ],
    });
  });
});
