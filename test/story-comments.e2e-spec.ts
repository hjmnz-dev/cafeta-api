import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { MediaStorage } from '../src/modules/uploads/media-storage.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { MemoryMediaStorage } from './support/memory-media-storage.js';
import { resetDb } from './support/reset-db.js';

// Comentarios en historias (funcionalidad 24, HU17) contra PostgreSQL real.
const PASSWORD = 'clave-segura-2026';
const PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d,
]);

interface Account {
  id: string;
  token: string;
}

describe('Comentarios en historias (e2e)', () => {
  let app: NestExpressApplication;
  let server: App;
  let prisma: PrismaService;
  let storage: MemoryMediaStorage;
  let careerId: string;

  beforeAll(async () => {
    storage = new MemoryMediaStorage();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MediaStorage)
      .useValue(storage)
      .compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();
    server = app.getHttpServer();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    storage.objects.clear();
    careerId = (
      await prisma.career.create({ data: { name: 'Ingeniería de Software' } })
    ).id;
  });

  const signUp = async (handle: string): Promise<Account> => {
    const res = await request(server)
      .post('/api/v1/auth/register')
      .send({
        email: `${handle}@est.intec.edu.do`,
        password: PASSWORD,
        firstName: handle,
        lastName: 'Prueba',
        handle,
        careerId,
        acceptTerms: true,
      })
      .expect(201);
    return { id: res.body.user.id, token: res.body.accessToken };
  };

  const auth = (account: Account) => ({
    Authorization: `Bearer ${account.token}`,
    'User-Agent': 'cafeta-e2e',
  });

  const publish = async (account: Account) => {
    const uploaded = await request(server)
      .post('/api/v1/uploads')
      .set(auth(account))
      .attach('file', PNG, 'foto.png')
      .expect(201);
    const res = await request(server)
      .post('/api/v1/stories')
      .set(auth(account))
      .send({ mediaKey: uploaded.body.key, text: 'Mi historia' })
      .expect(201);
    return res.body.id as string;
  };

  const base = (storyId: string) => `/api/v1/stories/${storyId}/comments`;

  const comment = (account: Account, storyId: string, content: unknown) =>
    request(server).post(base(storyId)).set(auth(account)).send({ content });

  const list = (account: Account, storyId: string, query = '') =>
    request(server)
      .get(`${base(storyId)}${query}`)
      .set(auth(account));

  const edit = (
    account: Account,
    storyId: string,
    commentId: string,
    content: unknown,
  ) =>
    request(server)
      .patch(`${base(storyId)}/${commentId}`)
      .set(auth(account))
      .send({ content });

  const deactivate = (account: Account, storyId: string, commentId: string) =>
    request(server)
      .post(`${base(storyId)}/${commentId}/deactivate`)
      .set(auth(account));

  const follow = (follower: Account, following: Account) =>
    prisma.follow.create({
      data: {
        followerId: follower.id,
        followingId: following.id,
        status: 'ACCEPTED',
      },
    });

  const contents = (res: { body: { items: { content: string }[] } }) =>
    res.body.items.map((c) => c.content);

  const commentCount = async (viewer: Account, storyId: string) => {
    const res = await request(server)
      .get('/api/v1/stories')
      .set(auth(viewer))
      .expect(200);
    const stories: { id: string; commentCount: number }[] =
      res.body.groups.flatMap((g: { stories: never[] }) => g.stories);
    return stories.find((s) => s.id === storyId)?.commentCount;
  };

  it('AC-1: comentar responde 201 con el texto recortado, mío y sin editar', async () => {
    const ana = await signUp('ana');
    const beto = await signUp('beto');
    const storyId = await publish(ana);

    const res = await comment(beto, storyId, '  Qué buena foto  ').expect(201);

    expect(res.body).toMatchObject({
      content: 'Qué buena foto',
      editedAt: null,
      isMine: true,
      author: { id: beto.id, handle: 'beto' },
    });
    const row = await prisma.storyComment.findUniqueOrThrow({
      where: { id: res.body.id },
    });
    expect(row).toMatchObject({ storyId, authorId: beto.id });
  });

  it('AC-2: el texto tiene de 1 a 500 caracteres y no admite campos de más', async () => {
    const ana = await signUp('ana');
    const storyId = await publish(ana);

    const empty = await comment(ana, storyId, '   ').expect(400);
    expect(empty.body.code).toBe('COMMENT_EMPTY');
    const long = await comment(ana, storyId, 'x'.repeat(501)).expect(400);
    expect(long.body.code).toBe('COMMENT_TOO_LONG');
    await comment(ana, storyId, 'x'.repeat(500)).expect(201);
    await request(server)
      .post(base(storyId))
      .set(auth(ana))
      .send({ content: 'ok', authorId: randomUUID() })
      .expect(400);
    expect(await prisma.storyComment.count()).toBe(1);
  });

  it('AC-3: la lista va del más antiguo al más nuevo, con cursor, y marca los míos', async () => {
    const ana = await signUp('ana');
    const beto = await signUp('beto');
    const storyId = await publish(ana);
    await comment(beto, storyId, 'Uno').expect(201);
    await comment(ana, storyId, 'Dos').expect(201);
    await comment(beto, storyId, 'Tres').expect(201);

    const first = await list(ana, storyId, '?limit=2').expect(200);
    expect(contents(first)).toEqual(['Uno', 'Dos']);
    expect(first.body.items.map((c: { isMine: boolean }) => c.isMine)).toEqual([
      false,
      true,
    ]);
    const second = await list(
      ana,
      storyId,
      `?limit=2&cursor=${first.body.nextCursor}`,
    ).expect(200);
    expect(contents(second)).toEqual(['Tres']);
    expect(second.body.nextCursor).toBeNull();
    const invalid = await list(ana, storyId, `?cursor=${randomUUID()}`).expect(
      400,
    );
    expect(invalid.body.code).toBe('INVALID_CURSOR');
  });

  it('AC-4: una historia que no se ve responde 404 STORY_NOT_FOUND en las cuatro rutas', async () => {
    const ana = await signUp('ana');
    const beto = await signUp('beto');
    const carla = await signUp('carla');
    const vencida = await publish(ana);
    const mio = await comment(beto, vencida, 'Antes de vencer').expect(201);
    await prisma.story.update({
      where: { id: vencida },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const desactivada = await publish(ana);
    await prisma.story.update({
      where: { id: desactivada },
      data: { deactivatedAt: new Date() },
    });
    const cerrada = await publish(carla);
    await request(server)
      .patch('/api/v1/me/privacy')
      .set(auth(carla))
      .send({ visibility: 'FOLLOWERS' })
      .expect(200);

    for (const id of [vencida, desactivada, cerrada, randomUUID()]) {
      for (const res of [
        await comment(beto, id, 'Hola'),
        await list(beto, id),
        await edit(beto, id, mio.body.id, 'Editado'),
        await deactivate(beto, id, mio.body.id),
      ]) {
        expect(res.status).toBe(404);
        expect(res.body.code).toBe('STORY_NOT_FOUND');
      }
    }
    // Lo que se comentó antes de vencer queda guardado, aunque ya no se vea.
    expect(await prisma.storyComment.count()).toBe(1);

    await follow(beto, carla);
    await comment(beto, cerrada, 'Hola').expect(201);
  });

  it('AC-5: la lista oculta los comentarios de cuentas desactivadas y de personas bloqueadas', async () => {
    const ana = await signUp('ana');
    const beto = await signUp('beto');
    const carla = await signUp('carla');
    const dani = await signUp('dani');
    const storyId = await publish(ana);
    await comment(beto, storyId, 'de beto').expect(201);
    await comment(carla, storyId, 'de carla').expect(201);
    await comment(dani, storyId, 'de dani').expect(201);
    await prisma.user.update({
      where: { id: carla.id },
      data: { deactivatedAt: new Date() },
    });
    await prisma.block.create({
      data: { blockerId: ana.id, blockedId: dani.id },
    });

    const res = await list(ana, storyId).expect(200);

    expect(contents(res)).toEqual(['de beto']);
  });

  it('AC-6: editar es solo del autor del comentario y marca editedAt', async () => {
    const ana = await signUp('ana');
    const beto = await signUp('beto');
    const storyId = await publish(ana);
    const created = await comment(beto, storyId, 'Original').expect(201);

    const done = await edit(beto, storyId, created.body.id, '  Corregido ');
    expect(done.status).toBe(200);
    expect(done.body).toMatchObject({ content: 'Corregido', isMine: true });
    expect(done.body.editedAt).not.toBeNull();

    // La autora de la historia no puede editar ni quitar comentarios ajenos.
    const foreign = await edit(ana, storyId, created.body.id, 'Mío').expect(
      403,
    );
    expect(foreign.body.code).toBe('NOT_COMMENT_AUTHOR');
    await deactivate(ana, storyId, created.body.id).expect(403);
    const row = await prisma.storyComment.findUniqueOrThrow({
      where: { id: created.body.id },
    });
    expect(row).toMatchObject({ content: 'Corregido', deactivatedAt: null });
  });

  it('AC-7: desactivar responde 204, lo saca de la lista, baja el conteo y conserva la fila', async () => {
    const ana = await signUp('ana');
    const beto = await signUp('beto');
    await follow(beto, ana);
    const storyId = await publish(ana);
    const created = await comment(beto, storyId, 'Para quitar').expect(201);
    await comment(beto, storyId, 'Se queda').expect(201);
    expect(await commentCount(ana, storyId)).toBe(2);

    await deactivate(beto, storyId, created.body.id).expect(204);

    expect(contents(await list(ana, storyId).expect(200))).toEqual([
      'Se queda',
    ]);
    expect(await commentCount(ana, storyId)).toBe(1);
    const row = await prisma.storyComment.findUniqueOrThrow({
      where: { id: created.body.id },
    });
    expect(row.deactivatedAt).not.toBeNull();
    expect(row.content).toBe('Para quitar');
  });

  it('AC-8: uno ya desactivado responde 409 ALREADY_INACTIVE al repetir y al editar', async () => {
    const ana = await signUp('ana');
    const beto = await signUp('beto');
    const storyId = await publish(ana);
    const created = await comment(beto, storyId, 'Adiós').expect(201);
    await deactivate(beto, storyId, created.body.id).expect(204);

    const again = await deactivate(beto, storyId, created.body.id).expect(409);
    expect(again.body.code).toBe('ALREADY_INACTIVE');
    await edit(beto, storyId, created.body.id, 'Vuelvo').expect(409);
  });

  it('AC-9: un comentario que no existe o es de otra historia responde 404 COMMENT_NOT_FOUND', async () => {
    const ana = await signUp('ana');
    const beto = await signUp('beto');
    const una = await publish(ana);
    const otra = await publish(ana);
    const created = await comment(beto, una, 'De la primera').expect(201);

    for (const res of [
      await edit(beto, una, randomUUID(), 'x'),
      await deactivate(beto, una, randomUUID()),
      await edit(beto, otra, created.body.id, 'x'),
      await deactivate(beto, otra, created.body.id),
    ]) {
      expect(res.status).toBe(404);
      expect(res.body.code).toBe('COMMENT_NOT_FOUND');
    }
  });

  it('AC-10: audita crear, editar y desactivar con el actor y el id del comentario', async () => {
    const ana = await signUp('ana');
    const beto = await signUp('beto');
    const storyId = await publish(ana);
    const created = await comment(beto, storyId, 'Hola').expect(201);
    await edit(beto, storyId, created.body.id, 'Hola otra vez').expect(200);
    await deactivate(beto, storyId, created.body.id).expect(204);

    const logs = await prisma.auditLog.findMany({
      where: { entityType: 'story_comment' },
      orderBy: { createdAt: 'asc' },
    });
    expect(logs.map((l) => l.action)).toEqual([
      'story_comment.create',
      'story_comment.update',
      'story_comment.deactivate',
    ]);
    for (const log of logs) {
      expect(log).toMatchObject({
        entityId: created.body.id,
        actorId: beto.id,
      });
    }
  });

  it('AC-11: avisa a la autora (STORY_COMMENT) y no a quien comenta en la suya', async () => {
    const ana = await signUp('ana');
    const beto = await signUp('beto');
    const storyId = await publish(ana);

    await comment(ana, storyId, 'Yo mismo').expect(201);
    expect(await prisma.notification.count()).toBe(0);

    await comment(beto, storyId, 'Gracias').expect(201);
    const rows = await prisma.notification.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      recipientId: ana.id,
      actorId: beto.id,
      type: 'STORY_COMMENT',
      storyId,
    });
  });

  it('AC-12: exige sesión en las cuatro rutas', async () => {
    const id = randomUUID();
    const url = base(id);
    await request(server).get(url).expect(401);
    await request(server).post(url).send({ content: 'x' }).expect(401);
    await request(server)
      .patch(`${url}/${id}`)
      .send({ content: 'x' })
      .expect(401);
    await request(server).post(`${url}/${id}/deactivate`).expect(401);
  });
});
