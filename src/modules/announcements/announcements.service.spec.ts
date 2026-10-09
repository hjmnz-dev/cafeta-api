import type {
  ActorContext,
  AuthenticatedUser,
} from '../../common/actor/actor-context.js';
import type { PostViewDto } from '../posts/dto/post-view.dto.js';
import type { PostsService } from '../posts/posts.service.js';
import { toAnnouncementPage } from './announcement-view.mapper.js';
import type { AnnouncementRow } from './announcement-queries.js';
import { AnnouncementsService } from './announcements.service.js';

// Reglas de AnnouncementsService (spec 0009, decisión 36): tipo y auditoría
// fijados por el servidor, y el texto es obligatorio.
const admin: AuthenticatedUser = {
  id: '01926f00-0000-7000-8000-000000000001',
  role: 'ADMIN',
  sessionId: '01926f00-0000-7000-8000-0000000000a1',
};
const actor: ActorContext = {
  userId: admin.id,
  role: 'ADMIN',
  ip: '10.0.0.7',
  userAgent: 'vitest',
};

function setup() {
  const publish = vi.fn(
    async (..._args: unknown[]) => ({ id: 'p1' }) as PostViewDto,
  );
  const service = new AnnouncementsService({
    publish,
  } as unknown as PostsService);
  return { service, publish };
}

describe('AnnouncementsService.create', () => {
  it('publica con el tipo ANNOUNCEMENT y la auditoría announcement.create', async () => {
    const { service, publish } = setup();

    await service.create({ content: 'Aviso', mediaKeys: ['k1'] }, admin, actor);

    expect(publish).toHaveBeenCalledWith(
      { content: 'Aviso', mediaKeys: ['k1'] },
      admin,
      actor,
      { type: 'ANNOUNCEMENT', action: 'announcement.create' },
    );
  });

  it('un texto vacío o de solo espacios da POST_CONTENT_REQUIRED sin publicar', async () => {
    const { service, publish } = setup();

    for (const content of ['', '   ', '\n\t ']) {
      await expect(
        service.create({ content, mediaKeys: ['k1'] }, admin, actor),
      ).rejects.toMatchObject({
        response: { code: 'POST_CONTENT_REQUIRED' },
      });
    }
    expect(publish).not.toHaveBeenCalled();
  });

  it('no deja pasar el tipo ni la ubicación que venga en el cuerpo', async () => {
    const { service, publish } = setup();
    const dto = {
      content: 'Aviso',
      type: 'TEXT',
      location: 'Biblioteca',
    } as never;

    await service.create(dto, admin, actor);

    expect(publish.mock.calls[0]?.[0]).toEqual({
      content: 'Aviso',
      mediaKeys: undefined,
    });
  });
});

describe('toAnnouncementPage', () => {
  const row = (id: string, patch: Partial<AnnouncementRow> = {}) =>
    ({
      id,
      content: 'Aviso',
      createdAt: new Date('2026-10-01T10:00:00.000Z'),
      editedAt: null,
      deactivatedAt: null,
      archivedAt: null,
      media: [{ storageKey: 'k', mediaType: 'IMAGE', mimeType: 'image/png' }],
      author: { profile: { handle: 'admin', displayName: 'Admin INTEC' } },
      _count: { reactions: 3, comments: 1 },
      ...patch,
    }) as AnnouncementRow;
  const url = (key: string) => `url:${key}`;

  it('arma la vista con enlaces, conteos y quién lo publicó', () => {
    const [item] = toAnnouncementPage([row('a')], 20, url).items;

    expect(item).toMatchObject({
      id: 'a',
      active: true,
      publishedBy: 'Admin INTEC',
      reactionCount: 3,
      commentCount: 1,
      media: [{ url: 'url:k', mediaType: 'IMAGE', mimeType: 'image/png' }],
    });
  });

  it('desactivado o archivado no está activo', () => {
    const off = new Date('2026-10-02T10:00:00.000Z');

    const [a, b] = toAnnouncementPage(
      [row('a', { deactivatedAt: off }), row('b', { archivedAt: off })],
      20,
      url,
    ).items;

    expect(a).toMatchObject({
      active: false,
      deactivatedAt: '2026-10-02T10:00:00.000Z',
    });
    expect(b).toMatchObject({ active: false, deactivatedAt: null });
  });

  it('da el cursor solo si llegó la fila extra', () => {
    expect(toAnnouncementPage([row('a')], 1, url).nextCursor).toBeNull();
    expect(toAnnouncementPage([row('a'), row('b')], 1, url).nextCursor).toBe(
      'a',
    );
  });
});
