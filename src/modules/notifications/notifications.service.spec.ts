import type { PrismaService } from '../../prisma/prisma.service.js';
import type { RealtimePublisher } from '../realtime/realtime.publisher.js';
import type { VisibilityService } from '../visibility/visibility.service.js';
import { NotificationsService } from './notifications.service.js';
import type { MediaUrlService } from '../uploads/media-url.service.js';

// La opción once (spec 0009): no repite el aviso del mismo receptor, actor,
// tipo y publicación. La base queda del otro lado de dobles por constructor.
const AUTHOR = '01926f00-0000-7000-8000-000000000001';
const FAN = '01926f00-0000-7000-8000-000000000002';
const POST = '01926f00-0000-7000-8000-000000000065';

function setup(existing: { id: string } | null) {
  const notification = {
    findFirst: vi.fn().mockResolvedValue(existing),
    create: vi.fn().mockResolvedValue({
      id: 'n1',
      type: 'POST_REACTION',
      postId: POST,
      storyId: null,
      conversationId: null,
      readAt: null,
      createdAt: new Date('2026-10-07T10:00:00.000Z'),
      actor: null,
    }),
  };
  const prisma = {
    notification,
    notificationPreference: { findUnique: vi.fn().mockResolvedValue(null) },
  };
  const visibility = {
    facts: vi.fn().mockResolvedValue({ ownerActive: true, blocked: false }),
  };
  const realtime = { toUsers: vi.fn() };
  const service = new NotificationsService(
    prisma as unknown as PrismaService,
    visibility as unknown as VisibilityService,
    realtime as unknown as RealtimePublisher,
    { urlFor: (key: string) => `https://blob.test/${key}` } as MediaUrlService,
  );
  return { service, notification, realtime };
}

const reaction = {
  recipientId: AUTHOR,
  actorId: FAN,
  type: 'POST_REACTION',
  postId: POST,
} as const;

describe('NotificationsService.notify con once', () => {
  it('crea el aviso si no existe uno igual', async () => {
    const { service, notification, realtime } = setup(null);

    await service.notify({ ...reaction, once: true });

    expect(notification.findFirst).toHaveBeenCalledWith({
      where: {
        recipientId: AUTHOR,
        actorId: FAN,
        type: 'POST_REACTION',
        postId: POST,
        storyId: null,
      },
      select: { id: true },
    });
    expect(notification.create).toHaveBeenCalledTimes(1);
    expect(realtime.toUsers).toHaveBeenCalledTimes(1);
  });

  it('no crea otro si ya existe uno con el mismo receptor, actor, tipo y publicación', async () => {
    const { service, notification, realtime } = setup({ id: 'n0' });

    await service.notify({ ...reaction, once: true });

    expect(notification.create).not.toHaveBeenCalled();
    expect(realtime.toUsers).not.toHaveBeenCalled();
  });

  it('sin once no busca repetidos y crea siempre', async () => {
    const { service, notification } = setup({ id: 'n0' });

    await service.notify(reaction);

    expect(notification.findFirst).not.toHaveBeenCalled();
    expect(notification.create).toHaveBeenCalledTimes(1);
  });
});
