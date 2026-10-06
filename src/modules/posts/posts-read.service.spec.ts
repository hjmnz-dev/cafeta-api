import { BadRequestException } from '@nestjs/common';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { MediaUrlService } from '../uploads/media-url.service.js';
import {
  afterCursor,
  authorWhere,
  feedWhere,
  POST_ORDER,
  POST_VIEW_SELECT,
} from './post-queries.js';
import { PostsReadService } from './posts-read.service.js';

// Paginación de PostsReadService (spec 0005, AC-5): qué le pide a Prisma y cómo
// resuelve el cursor. La base queda del otro lado de dobles por constructor.
const ME = '01926f00-0000-7000-8000-000000000001';
const CURSOR = '01926f00-0000-7000-8000-000000000065';
const CURSOR_AT = new Date('2026-09-26T10:00:00.000Z');

function setup(
  cursorPost: { createdAt: Date } | null = { createdAt: CURSOR_AT },
) {
  const post = {
    findMany: vi.fn().mockResolvedValue([]),
    findUnique: vi.fn().mockResolvedValue(cursorPost),
    count: vi.fn().mockResolvedValue(7),
  };
  const service = new PostsReadService(
    { post } as unknown as PrismaService,
    { urlFor: (key: string) => key } as unknown as MediaUrlService,
  );
  return { service, post };
}

describe('PostsReadService', () => {
  it('AC-5: la primera página pide limit + 1 filas en el orden del feed', async () => {
    const { service, post } = setup();

    await service.feed(ME, { limit: 20 });

    expect(post.findMany).toHaveBeenCalledWith({
      where: feedWhere(ME, undefined),
      orderBy: POST_ORDER,
      take: 21,
      select: POST_VIEW_SELECT,
    });
    expect(post.findUnique).not.toHaveBeenCalled();
  });

  it('AC-6: con careerId pide la pestaña de esa carrera', async () => {
    const { service, post } = setup();
    const careerId = '01926f00-0000-7000-8000-0000000000c1';

    await service.feed(ME, { limit: 20, careerId });

    expect(post.findMany.mock.calls[0][0].where).toEqual(
      feedWhere(ME, careerId),
    );
  });

  it('AC-5: con cursor busca su created_at y pide solo lo que viene después', async () => {
    const { service, post } = setup();

    await service.feed(ME, { limit: 20, cursor: CURSOR });

    expect(post.findUnique).toHaveBeenCalledWith({
      where: { id: CURSOR },
      select: { createdAt: true },
    });
    expect(post.findMany.mock.calls[0][0].where).toEqual({
      AND: [feedWhere(ME, undefined), afterCursor(CURSOR_AT, CURSOR)],
    });
  });

  it('AC-5: un cursor que no existe da INVALID_CURSOR sin pedir la lista', async () => {
    const { service, post } = setup(null);

    const error = await service
      .feed(ME, { limit: 20, cursor: CURSOR })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toMatchObject({
      code: 'INVALID_CURSOR',
    });
    expect(post.findMany).not.toHaveBeenCalled();
  });

  it('AC-3: byAuthor pide solo las publicaciones visibles del autor', async () => {
    const { service, post } = setup();

    await service.byAuthor(ME, { limit: 5 });

    expect(post.findMany.mock.calls[0][0]).toMatchObject({
      where: authorWhere(ME),
      take: 6,
    });
  });

  it('AC-3: countByAuthor cuenta con la misma regla de visibles', async () => {
    const { service, post } = setup();

    expect(await service.countByAuthor(ME)).toEqual({ count: 7 });
    expect(post.count).toHaveBeenCalledWith({ where: authorWhere(ME) });
  });
});
