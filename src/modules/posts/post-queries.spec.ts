import {
  afterCursor,
  authorWhere,
  feedWhere,
  POST_ORDER,
  VISIBLE_POST,
} from './post-queries.js';

// Filtros de Prisma del feed (spec 0005). Las e2e prueban el resultado contra
// PostgreSQL; aquí se fija la forma de cada filtro.
const ME = '01926f00-0000-7000-8000-000000000001';
const CAREER = '01926f00-0000-7000-8000-0000000000c1';
// Un filtro cualquiera: la regla real vive en VisibilityService.
const VISIBLE_AUTHOR = { id: 'visible' };
const VISIBLE = {
  OR: [{ type: 'ANNOUNCEMENT' }, { author: VISIBLE_AUTHOR }],
};

describe('VISIBLE_POST', () => {
  it('excluye archivadas, desactivadas y de autores desactivados', () => {
    expect(VISIBLE_POST).toEqual({
      deactivatedAt: null,
      archivedAt: null,
      author: { deactivatedAt: null },
    });
  });
});

describe('POST_ORDER', () => {
  it('AC-5: ordena por created_at y desempata por id, las dos de mayor a menor', () => {
    expect(POST_ORDER).toEqual([{ createdAt: 'desc' }, { id: 'desc' }]);
  });
});

describe('feedWhere', () => {
  it('AC-4: "Para ti" junta mías, seguidos ACCEPTED activos y anuncios, siempre visibles', () => {
    expect(feedWhere(ME, VISIBLE_AUTHOR)).toEqual({
      AND: [
        VISIBLE_POST,
        VISIBLE,
        {
          OR: [
            { authorId: ME },
            {
              author: {
                followers: {
                  some: {
                    followerId: ME,
                    status: 'ACCEPTED',
                    deactivatedAt: null,
                  },
                },
              },
            },
            { type: 'ANNOUNCEMENT' },
          ],
        },
      ],
    });
  });

  it('AC-6: la pestaña de carrera filtra por la carrera del autor sin mirar seguimientos', () => {
    const where = feedWhere(ME, VISIBLE_AUTHOR, CAREER);
    expect(where).toEqual({
      AND: [
        VISIBLE_POST,
        VISIBLE,
        { author: { profile: { careerId: CAREER } } },
      ],
    });
    expect(JSON.stringify(where)).not.toContain('followers');
  });

  it('decisión 15: las dos pestañas exigen un autor visible, salvo los anuncios', () => {
    expect(feedWhere(ME, VISIBLE_AUTHOR).AND).toContainEqual(VISIBLE);
    expect(feedWhere(ME, VISIBLE_AUTHOR, CAREER).AND).toContainEqual(VISIBLE);
  });
});

describe('authorWhere', () => {
  it('AC-3: mis publicaciones también respetan la regla de visibles', () => {
    expect(authorWhere(ME)).toEqual({ AND: [VISIBLE_POST, { authorId: ME }] });
  });
});

describe('afterCursor', () => {
  it('AC-5: pide lo más antiguo, o lo del mismo instante con id menor', () => {
    const at = new Date('2026-09-26T10:00:00.000Z');
    expect(afterCursor(at, 'id-9')).toEqual({
      OR: [{ createdAt: { lt: at } }, { createdAt: at, id: { lt: 'id-9' } }],
    });
  });
});
