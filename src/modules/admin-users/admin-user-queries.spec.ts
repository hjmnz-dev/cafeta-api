import { adminUsersWhere } from './admin-user-queries.js';
import { toAdminUserPage } from './admin-user-view.mapper.js';
import type { AdminUserRow } from './admin-user-queries.js';

// Los filtros de la lista y su forma de salida (spec 0009, decisión 32).
function row(id: string, deactivatedAt: Date | null = null): AdminUserRow {
  return {
    id,
    email: `${id}@est.intec.edu.do`,
    role: 'STUDENT',
    verificationStatus: 'PENDING',
    deactivatedAt,
    createdAt: new Date('2026-10-01T10:00:00.000Z'),
    profile: { handle: id, displayName: 'Ana', career: { name: 'Sistemas' } },
  };
}

describe('adminUsersWhere', () => {
  it('sin filtros no restringe nada', () => {
    expect(adminUsersWhere({})).toEqual({});
  });

  it('busca en correo, usuario y nombre sin importar mayúsculas', () => {
    const where = adminUsersWhere({ search: 'ana' });
    const match = { contains: 'ana', mode: 'insensitive' };
    expect(where).toEqual({
      AND: [
        {
          OR: [
            { email: match },
            { profile: { handle: match } },
            { profile: { displayName: match } },
          ],
        },
      ],
    });
  });

  it('traduce active e inactive a deactivatedAt', () => {
    expect(adminUsersWhere({ status: 'active' })).toEqual({
      AND: [{ deactivatedAt: null }],
    });
    expect(adminUsersWhere({ status: 'inactive' })).toEqual({
      AND: [{ deactivatedAt: { not: null } }],
    });
  });

  it('combina verificación y rol con "y"', () => {
    expect(
      adminUsersWhere({ verification: 'PENDING', role: 'STUDENT' }),
    ).toEqual({
      AND: [{ verificationStatus: 'PENDING' }, { role: 'STUDENT' }],
    });
  });
});

describe('toAdminUserPage', () => {
  it('marca active según deactivatedAt y expone carrera y usuario', () => {
    const page = toAdminUserPage(
      [row('a'), row('b', new Date('2026-10-02T00:00:00.000Z'))],
      5,
    );
    expect(page.items[0]).toMatchObject({
      active: true,
      deactivatedAt: null,
      handle: 'a',
      career: 'Sistemas',
    });
    expect(page.items[1]).toMatchObject({
      active: false,
      deactivatedAt: '2026-10-02T00:00:00.000Z',
    });
    expect(page.nextCursor).toBeNull();
  });

  it('con la fila extra devuelve limit filas y el cursor de la última', () => {
    const page = toAdminUserPage([row('a'), row('b'), row('c')], 2);
    expect(page.items.map((item) => item.id)).toEqual(['a', 'b']);
    expect(page.nextCursor).toBe('b');
  });
});
