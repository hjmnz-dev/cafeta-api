import type { PostViewRow } from './post-queries.js';
import { toPostPage, toPostView } from './post-view.mapper.js';

// Vista pública de una publicación (spec 0005, AC-8): lo que ve la web y lo
// que nunca sale de la base.
const row = (overrides: Partial<PostViewRow> = {}): PostViewRow => ({
  id: '01926f00-0000-7000-8000-000000000065',
  type: 'EVENT',
  content: 'Hackathon',
  location: 'Auditorio',
  createdAt: new Date('2026-09-26T10:00:00.000Z'),
  editedAt: new Date('2026-09-26T11:00:00.000Z'),
  eventStartsAt: new Date('2026-10-10T14:00:00.000Z'),
  eventLocation: 'Laboratorio 3',
  codeSnippet: null,
  groupName: null,
  groupSpots: null,
  author: {
    id: '01926f00-0000-7000-8000-000000000001',
    verificationStatus: 'VERIFIED',
    profile: {
      handle: 'cgomez_intec',
      displayName: 'Carlos Gómez',
      career: { name: 'Ingeniería de Software' },
    },
  },
  _count: { reactions: 12, comments: 3 },
  ...overrides,
});

describe('toPostView', () => {
  it('AC-8: convierte las fechas a ISO y lleva los conteos y los datos del autor', () => {
    expect(toPostView(row())).toEqual({
      id: '01926f00-0000-7000-8000-000000000065',
      type: 'EVENT',
      content: 'Hackathon',
      location: 'Auditorio',
      createdAt: '2026-09-26T10:00:00.000Z',
      editedAt: '2026-09-26T11:00:00.000Z',
      eventStartsAt: '2026-10-10T14:00:00.000Z',
      eventLocation: 'Laboratorio 3',
      codeSnippet: null,
      groupName: null,
      groupSpots: null,
      author: {
        id: '01926f00-0000-7000-8000-000000000001',
        handle: 'cgomez_intec',
        displayName: 'Carlos Gómez',
        careerName: 'Ingeniería de Software',
        verified: true,
      },
      reactionCount: 12,
      commentCount: 3,
    });
  });

  it('las fechas opcionales vacías quedan en null', () => {
    const view = toPostView(row({ editedAt: null, eventStartsAt: null }));
    expect(view.editedAt).toBeNull();
    expect(view.eventStartsAt).toBeNull();
  });

  it('solo VERIFIED cuenta como verificado', () => {
    for (const status of ['PENDING', 'REJECTED'] as const) {
      const base = row();
      const view = toPostView(
        row({ author: { ...base.author, verificationStatus: status } }),
      );
      expect(view.author.verified).toBe(false);
    }
  });

  it('un autor sin carrera (el admin) sale con careerName null', () => {
    const base = row();
    const view = toPostView(
      row({
        author: {
          ...base.author,
          profile: { handle: 'cafeta', displayName: 'Cafeta', career: null },
        },
      }),
    );
    expect(view.author.careerName).toBeNull();
  });

  it('un autor sin perfil no rompe la vista', () => {
    const base = row();
    const view = toPostView(row({ author: { ...base.author, profile: null } }));
    expect(view.author).toMatchObject({
      handle: '',
      displayName: '',
      careerName: null,
    });
  });

  it('no expone nada de users fuera del id y el verificado', () => {
    const view = toPostView(row());
    expect(Object.keys(view.author).sort()).toEqual([
      'careerName',
      'displayName',
      'handle',
      'id',
      'verified',
    ]);
    expect(JSON.stringify(view)).not.toContain('verificationStatus');
  });
});

describe('toPostPage', () => {
  const rows = (n: number) =>
    Array.from({ length: n }, (_, i) => row({ id: `id-${i + 1}` }));

  it('AC-5: con una fila de más devuelve limit filas y el id de la última como cursor', () => {
    const page = toPostPage(rows(4), 3);
    expect(page.items.map((p) => p.id)).toEqual(['id-1', 'id-2', 'id-3']);
    expect(page.nextCursor).toBe('id-3');
  });

  it('AC-5: con exactamente limit filas no hay página siguiente', () => {
    const page = toPostPage(rows(3), 3);
    expect(page.items).toHaveLength(3);
    expect(page.nextCursor).toBeNull();
  });

  it('una lista vacía no tiene cursor', () => {
    expect(toPostPage([], 20)).toEqual({ items: [], nextCursor: null });
  });
});
