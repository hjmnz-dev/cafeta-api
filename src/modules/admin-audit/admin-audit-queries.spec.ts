import { afterAuditCursor, auditWhere } from './admin-audit-queries.js';
import type { AuditRow } from './admin-audit-queries.js';
import { toAuditPage } from './admin-audit-view.mapper.js';
import { parseAuditRange } from './audit-range.js';

// Los filtros de la bitácora y su forma de salida (spec 0009, decisión 34).
function row(id: string, withActor = true): AuditRow {
  return {
    id,
    createdAt: new Date('2026-10-01T10:00:00.000Z'),
    actorRole: withActor ? 'ADMIN' : null,
    action: 'post.deactivate',
    entityType: 'post',
    entityId: null,
    succeeded: true,
    metadata: { by: 'admin' },
    ip: '127.0.0.1',
    actor: withActor
      ? { id: 'u1', email: 'ana@intec.edu.do', profile: { handle: 'ana' } }
      : null,
  };
}

describe('parseAuditRange', () => {
  it('sin fechas no acota nada', () => {
    expect(parseAuditRange()).toEqual({});
  });

  it('toma días completos de Santo Domingo, con el último inclusivo', () => {
    const range = parseAuditRange('2026-10-01', '2026-10-02');
    expect(range.gte?.toISOString()).toBe('2026-10-01T04:00:00.000Z');
    expect(range.lt?.toISOString()).toBe('2026-10-03T04:00:00.000Z');
  });

  it('acepta un solo extremo', () => {
    expect(parseAuditRange('2026-10-01').lt).toBeUndefined();
    expect(parseAuditRange(undefined, '2026-10-01').gte).toBeUndefined();
  });

  it('acepta el mismo día en los dos extremos', () => {
    const range = parseAuditRange('2026-10-01', '2026-10-01');
    expect(range.lt!.getTime() - range.gte!.getTime()).toBe(86_400_000);
  });

  it.each([
    ['2026-10-02', '2026-10-01'],
    ['2026-02-31', undefined],
    ['10/01/2026', undefined],
    ['1999-12-31', undefined],
    [undefined, '2101-01-01'],
  ])('rechaza el rango %s a %s', (from, to) => {
    expect(() => parseAuditRange(from, to)).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({ code: 'INVALID_DATE_RANGE' }),
      }),
    );
  });
});

describe('auditWhere', () => {
  it('sin filtros no restringe nada', () => {
    expect(auditWhere({})).toEqual({});
  });

  it('busca al actor por correo o usuario sin importar mayúsculas', () => {
    const match = { contains: 'ana', mode: 'insensitive' };
    expect(auditWhere({ actor: 'ana' })).toEqual({
      AND: [
        { actor: { OR: [{ email: match }, { profile: { handle: match } }] } },
      ],
    });
  });

  it('combina acción, entidad y resultado con "y"', () => {
    expect(
      auditWhere({
        action: 'post.create',
        entityType: 'post',
        succeeded: false,
      }),
    ).toEqual({
      AND: [
        { action: 'post.create' },
        { entityType: 'post' },
        { succeeded: false },
      ],
    });
  });

  it('succeeded false cuenta como filtro, no como ausencia', () => {
    expect(auditWhere({ succeeded: false })).toEqual({
      AND: [{ succeeded: false }],
    });
  });

  it('convierte el rango en una condición sobre createdAt', () => {
    const where = auditWhere({ from: '2026-10-01', to: '2026-10-01' });
    expect(where).toEqual({
      AND: [
        {
          createdAt: {
            gte: new Date('2026-10-01T04:00:00.000Z'),
            lt: new Date('2026-10-02T04:00:00.000Z'),
          },
        },
      ],
    });
  });
});

describe('afterAuditCursor', () => {
  it('toma lo anterior a la fila y desempata por id', () => {
    const at = new Date('2026-10-01T10:00:00.000Z');
    expect(afterAuditCursor(at, 'x')).toEqual({
      OR: [{ createdAt: { lt: at } }, { createdAt: at, id: { lt: 'x' } }],
    });
  });
});

describe('toAuditPage', () => {
  it('arma el actor con el rol que tenía al actuar y no expone userAgent', () => {
    const [entry] = toAuditPage([row('a')], 20).items;
    expect(entry?.actor).toEqual({
      id: 'u1',
      email: 'ana@intec.edu.do',
      handle: 'ana',
      role: 'ADMIN',
    });
    expect(entry).not.toHaveProperty('userAgent');
    expect(entry?.createdAt).toBe('2026-10-01T10:00:00.000Z');
  });

  it('un intento sin sesión sale sin actor', () => {
    expect(toAuditPage([row('a', false)], 20).items[0]?.actor).toBeNull();
  });

  it('da el cursor solo si llegó la fila extra', () => {
    expect(toAuditPage([row('a'), row('b')], 2).nextCursor).toBeNull();
    const page = toAuditPage([row('a'), row('b'), row('c')], 2);
    expect(page.items).toHaveLength(2);
    expect(page.nextCursor).toBe('b');
  });
});
