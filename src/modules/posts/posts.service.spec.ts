import { BadRequestException } from '@nestjs/common';
import type {
  ActorContext,
  AuthenticatedUser,
} from '../../common/actor/actor-context.js';
import type { AuditService } from '../../common/audit/audit.service.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { PostViewRow } from './post-queries.js';
import { PostsService } from './posts.service.js';

// Reglas de PostsService.create (spec 0005): autor del token, tipo fijo,
// texto recortado y auditoría en la misma transacción. La base queda del otro
// lado de dobles por constructor.
const user: AuthenticatedUser = {
  id: '01926f00-0000-7000-8000-000000000001',
  role: 'STUDENT',
  sessionId: '01926f00-0000-7000-8000-0000000000a1',
};

const actor: ActorContext = {
  userId: user.id,
  role: 'STUDENT',
  ip: '10.0.0.7',
  userAgent: 'vitest',
};

const created: PostViewRow = {
  id: '01926f00-0000-7000-8000-000000000099',
  type: 'TEXT',
  content: 'Hola INTEC',
  location: 'Biblioteca',
  createdAt: new Date('2026-09-26T10:00:00.000Z'),
  editedAt: null,
  eventStartsAt: null,
  eventLocation: null,
  codeSnippet: null,
  groupName: null,
  groupSpots: null,
  author: {
    id: user.id,
    verificationStatus: 'PENDING',
    profile: {
      handle: 'cgomez_intec',
      displayName: 'Carlos Gómez',
      career: { name: 'Ingeniería de Software' },
    },
  },
  _count: { reactions: 0, comments: 0 },
};

function setup(record = vi.fn().mockResolvedValue(undefined)) {
  const tx = { post: { create: vi.fn().mockResolvedValue(created) } };
  const $transaction = vi.fn(async (fn: (client: typeof tx) => unknown) =>
    fn(tx),
  );
  const service = new PostsService(
    { $transaction } as unknown as PrismaService,
    { record } as unknown as AuditService,
  );
  return { service, tx, $transaction, record };
}

describe('PostsService.create', () => {
  it('AC-1: guarda TEXT con el autor del token, el texto recortado y la ubicación', async () => {
    const { service, tx } = setup();

    const view = await service.create(
      { content: '  Hola INTEC  ', location: 'Biblioteca' },
      user,
      actor,
    );

    expect(tx.post.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          authorId: user.id,
          type: 'TEXT',
          content: 'Hola INTEC',
          location: 'Biblioteca',
        },
      }),
    );
    expect(view).toMatchObject({ id: created.id, content: 'Hola INTEC' });
  });

  it('AC-1: sin ubicación la guarda como null', async () => {
    const { service, tx } = setup();

    await service.create({ content: 'Sin lugar' }, user, actor);

    expect(tx.post.create.mock.calls[0][0].data.location).toBeNull();
  });

  it('AC-13: audita post.create con el id nuevo y el actor, sin copiar el texto', async () => {
    const { service, tx, record } = setup();

    await service.create({ content: 'Hola INTEC' }, user, actor);

    expect(record).toHaveBeenCalledWith(tx, {
      action: 'post.create',
      entityType: 'post',
      entityId: created.id,
      actor,
      succeeded: true,
    });
    expect(JSON.stringify(record.mock.calls[0][1])).not.toContain('Hola');
  });

  it('AC-2: texto vacío o solo espacios da POST_CONTENT_REQUIRED sin abrir transacción', async () => {
    const { service, $transaction } = setup();

    for (const content of ['', '   ', '\n\t ']) {
      const error = await service
        .create({ content }, user, actor)
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toMatchObject({
        code: 'POST_CONTENT_REQUIRED',
      });
    }
    expect($transaction).not.toHaveBeenCalled();
  });

  it('AC-13: si la auditoría falla, el error sale de la transacción (y la deshace)', async () => {
    const { service } = setup(
      vi.fn().mockRejectedValue(new Error('bitácora caída')),
    );

    await expect(
      service.create({ content: 'Hola' }, user, actor),
    ).rejects.toThrow('bitácora caída');
  });
});
