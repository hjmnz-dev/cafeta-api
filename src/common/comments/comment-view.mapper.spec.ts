import { toCommentPage, toCommentView } from './comment-view.mapper.js';
import type { CommentViewRow } from './comment-view.mapper.js';

// Cómo se convierte la fila de un comentario en lo que ve la web.
const ME = '01926f00-0000-7000-8000-000000000001';
const OTHER = '01926f00-0000-7000-8000-000000000002';
const urlFor = (key: string) => `https://blob.test/${key}`;

const row = (
  id: string,
  authorId = OTHER,
  overrides: Partial<CommentViewRow> = {},
): CommentViewRow => ({
  id,
  content: `texto ${id}`,
  createdAt: new Date('2026-10-07T12:00:00.000Z'),
  editedAt: null,
  author: {
    id: authorId,
    profile: { handle: 'beto', displayName: 'Beto Ramírez', avatarKey: null },
  },
  ...overrides,
});

describe('toCommentView', () => {
  it('marca isMine solo cuando el autor es quien mira', () => {
    expect(toCommentView(row('c1', ME), ME, urlFor).isMine).toBe(true);
    expect(toCommentView(row('c1', OTHER), ME, urlFor).isMine).toBe(false);
  });

  it('convierte las fechas a ISO y deja editedAt en null si no se editó', () => {
    const view = toCommentView(row('c1'), ME, urlFor);
    expect(view.createdAt).toBe('2026-10-07T12:00:00.000Z');
    expect(view.editedAt).toBeNull();
    const edited = toCommentView(
      row('c1', OTHER, { editedAt: new Date('2026-10-07T13:00:00.000Z') }),
      ME,
      urlFor,
    );
    expect(edited.editedAt).toBe('2026-10-07T13:00:00.000Z');
  });

  it('arma el enlace de la foto solo si tiene una', () => {
    const withPhoto = row('c1', OTHER, {
      author: {
        id: OTHER,
        profile: {
          handle: 'beto',
          displayName: 'Beto',
          avatarKey: 'image/a.png',
        },
      },
    });
    expect(toCommentView(withPhoto, ME, urlFor).author.avatarUrl).toBe(
      'https://blob.test/image/a.png',
    );
    expect(toCommentView(row('c1'), ME, urlFor).author.avatarUrl).toBeNull();
  });

  it('sin perfil devuelve textos vacíos y no falla', () => {
    const view = toCommentView(
      row('c1', OTHER, { author: { id: OTHER, profile: null } }),
      ME,
      urlFor,
    );
    expect(view.author).toMatchObject({ handle: '', displayName: '' });
  });
});

describe('toCommentPage', () => {
  it('con una fila de más hay página siguiente y el cursor es el último comentario mostrado', () => {
    const page = toCommentPage(
      [row('c1'), row('c2'), row('c3')],
      2,
      ME,
      urlFor,
    );
    expect(page.items.map((i) => i.id)).toEqual(['c1', 'c2']);
    expect(page.nextCursor).toBe('c2');
  });

  it('sin fila de más no hay cursor', () => {
    const page = toCommentPage([row('c1'), row('c2')], 2, ME, urlFor);
    expect(page.items).toHaveLength(2);
    expect(page.nextCursor).toBeNull();
  });

  it('una lista vacía no tiene cursor', () => {
    expect(toCommentPage([], 20, ME, urlFor)).toEqual({
      items: [],
      nextCursor: null,
    });
  });
});
