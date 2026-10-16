import type { StoryViewRow } from './story-queries.js';
import { toStoryTray, toStoryView } from './story-view.mapper.js';

const AUTHOR = '01926f00-0000-7000-8000-0000000000aa';
const VIEWER = '01926f00-0000-7000-8000-0000000000bb';
const urlFor = (key: string) => `https://media.test/${key}`;

const row = (overrides: Partial<StoryViewRow> = {}): StoryViewRow => ({
  id: '01926f00-0000-7000-8000-000000000001',
  text: 'Hola',
  mediaKey: 'u/foto.png',
  mediaType: 'IMAGE',
  mediaMimeType: 'image/png',
  createdAt: new Date('2026-10-08T10:00:00.000Z'),
  expiresAt: new Date('2026-10-09T10:00:00.000Z'),
  editedAt: null,
  author: {
    id: AUTHOR,
    profile: { handle: 'ana', displayName: 'Ana', avatarKey: null },
  },
  reactions: [],
  views: [],
  _count: { reactions: 3, comments: 2 },
  ...overrides,
});

describe('toStoryView · reacciones y comentarios (decisión 24)', () => {
  it('el autor ve el conteo de reacciones', () => {
    const view = toStoryView(row(), AUTHOR, urlFor);

    expect(view).toMatchObject({
      reactionCount: 3,
      myReaction: null,
      commentCount: 2,
    });
  });

  it('quien no es el autor recibe reactionCount null y su propia reacción', () => {
    const view = toStoryView(
      row({ reactions: [{ type: 'FIRE' }] }),
      VIEWER,
      urlFor,
    );

    expect(view).toMatchObject({
      reactionCount: null,
      myReaction: 'FIRE',
      commentCount: 2,
    });
  });

  it('la bandeja aplica la misma regla a cada historia', () => {
    const tray = toStoryTray([row()], VIEWER, urlFor);

    expect(tray.groups[0].stories[0].reactionCount).toBeNull();
  });
});

describe('historias vistas (bug 1068)', () => {
  it('seenByMe es true solo si tengo una fila de vista', () => {
    expect(toStoryView(row(), VIEWER, urlFor)?.seenByMe).toBe(false);
    expect(
      toStoryView(row({ views: [{ id: 'v1' }] }), VIEWER, urlFor)?.seenByMe,
    ).toBe(true);
  });

  it('la bandeja pone primero a los autores con algo sin ver', () => {
    const OTHER = '01926f00-0000-7000-8000-0000000000cc';
    const tray = toStoryTray(
      [
        // La más reciente es de Ana, pero ya la vi.
        row({ id: 's2', views: [{ id: 'v1' }] }),
        row({
          id: 's1',
          author: {
            id: OTHER,
            profile: { handle: 'beto', displayName: 'Beto', avatarKey: null },
          },
        }),
      ],
      VIEWER,
      urlFor,
    );

    expect(tray.groups.map((g) => g.author.handle)).toEqual(['beto', 'ana']);
  });
});
