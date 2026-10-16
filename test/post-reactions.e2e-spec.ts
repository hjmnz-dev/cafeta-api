import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { resetDb } from './support/reset-db.js';

// Reaccionar a publicaciones (spec 0009, decisión 20; HU28) contra PostgreSQL
// real: poner, cambiar y quitar son idempotentes y el conteo no se duplica.
const PASSWORD = 'clave-segura-2026';
const MISSING_ID = '01926f00-0000-7000-8000-000000000000';

interface Account {
  id: string;
  token: string;
}

describe('Reacciones a publicaciones (e2e)', () => {
  let app: NestExpressApplication;
  let server: App;
  let prisma: PrismaService;
  let careerId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
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

  const as = (account: Account) => {
    const auth = { Authorization: `Bearer ${account.token}` };
    return {
      get: (path: string) => request(server).get(`/api/v1${path}`).set(auth),
      post: (path: string, body: Record<string, unknown> = {}) =>
        request(server).post(`/api/v1${path}`).set(auth).send(body),
      put: (path: string, body: Record<string, unknown> = {}) =>
        request(server).put(`/api/v1${path}`).set(auth).send(body),
      patch: (path: string, body: Record<string, unknown> = {}) =>
        request(server).patch(`/api/v1${path}`).set(auth).send(body),
      delete: (path: string) =>
        request(server).delete(`/api/v1${path}`).set(auth),
    };
  };

  const publish = async (author: Account): Promise<string> => {
    const res = await as(author)
      .post('/posts', { content: 'Hola INTEC' })
      .expect(201);
    return res.body.id;
  };

  const react = (account: Account, postId: string, type: string) =>
    as(account).put(`/posts/${postId}/reaction`, { type });

  const unreact = (account: Account, postId: string) =>
    as(account).delete(`/posts/${postId}/reaction`);

  const noticesOf = async (account: Account): Promise<string[]> => {
    const res = await as(account).get('/notifications').expect(200);
    return res.body.items.map((n: { type: string }) => n.type);
  };

  it('AC-1: reaccionar suma al conteo y la tarjeta del feed trae mi reacción', async () => {
    const ana = await signUp('ana');
    const beto = await signUp('beto');
    const postId = await publish(ana);

    const res = await react(beto, postId, 'FIRE').expect(200);

    expect(res.body).toEqual({ reactionCount: 1, myReaction: 'FIRE' });
    const feed = await as(ana).get('/posts/feed').expect(200);
    expect(feed.body.items[0]).toMatchObject({
      reactionCount: 1,
      myReaction: null,
    });
    // Beto ve la publicación de Ana en la pestaña de su carrera.
    const careerFeed = await as(beto)
      .get(`/posts/feed?careerId=${careerId}`)
      .expect(200);
    expect(careerFeed.body.items[0]).toMatchObject({
      reactionCount: 1,
      myReaction: 'FIRE',
    });
  });

  it('AC-2: repetir el mismo tipo deja el conteo en 1', async () => {
    const ana = await signUp('ana');
    const beto = await signUp('beto');
    const postId = await publish(ana);

    await react(beto, postId, 'HEART').expect(200);
    const again = await react(beto, postId, 'HEART').expect(200);

    expect(again.body).toEqual({ reactionCount: 1, myReaction: 'HEART' });
    expect(await prisma.postReaction.count()).toBe(1);
  });

  it('AC-3: cambiar de tipo reemplaza la reacción sin sumar', async () => {
    const ana = await signUp('ana');
    const beto = await signUp('beto');
    const postId = await publish(ana);

    await react(beto, postId, 'HEART').expect(200);
    const changed = await react(beto, postId, 'WOW').expect(200);

    expect(changed.body).toEqual({ reactionCount: 1, myReaction: 'WOW' });
    expect(await prisma.postReaction.count()).toBe(1);
  });

  it('AC-4: quitar baja el conteo, conserva la fila y quitar sin reacción no falla', async () => {
    const ana = await signUp('ana');
    const beto = await signUp('beto');
    const postId = await publish(ana);

    await react(beto, postId, 'CLAP').expect(200);
    const removed = await unreact(beto, postId).expect(200);
    const again = await unreact(beto, postId).expect(200);

    expect(removed.body).toEqual({ reactionCount: 0, myReaction: null });
    expect(again.body).toEqual({ reactionCount: 0, myReaction: null });
    const row = await prisma.postReaction.findFirstOrThrow();
    expect(row.deactivatedAt).not.toBeNull();
    // Volver a reaccionar reutiliza la fila.
    const back = await react(beto, postId, 'LAUGH').expect(200);
    expect(back.body).toEqual({ reactionCount: 1, myReaction: 'LAUGH' });
    expect(await prisma.postReaction.count()).toBe(1);
  });

  it('AC-5: dos toques simultáneos no duplican la reacción', async () => {
    const ana = await signUp('ana');
    const beto = await signUp('beto');
    const postId = await publish(ana);

    const results = await Promise.all([
      react(beto, postId, 'FIRE'),
      react(beto, postId, 'FIRE'),
      react(beto, postId, 'FIRE'),
    ]);

    results.forEach((res) => expect(res.status).toBe(200));
    expect(await prisma.postReaction.count()).toBe(1);
    expect(await noticesOf(ana)).toEqual(['POST_REACTION']);
  });

  it('AC-6: reaccionar a algo que no veo da 404', async () => {
    const ana = await signUp('ana');
    const beto = await signUp('beto');
    const carla = await signUp('carla');
    const privateId = await publish(ana);
    const archivedId = await publish(carla);
    const blockedId = await publish(beto);
    await as(ana).patch('/me/privacy', { visibility: 'PRIVATE' }).expect(200);
    await prisma.post.update({
      where: { id: archivedId },
      data: { archivedAt: new Date() },
    });
    await as(beto).post(`/users/${ana.id}/block`).expect(200);

    for (const [who, id] of [
      [beto, privateId],
      [beto, archivedId],
      [ana, blockedId],
      [beto, MISSING_ID],
    ] as const) {
      const res = await react(who, id, 'HEART').expect(404);
      expect(res.body.code).toBe('POST_NOT_FOUND');
      await unreact(who, id).expect(404);
    }
    expect(await prisma.postReaction.count()).toBe(0);
  });

  it('AC-7: reaccionar y quitar varias veces deja un solo aviso al autor', async () => {
    const ana = await signUp('ana');
    const beto = await signUp('beto');
    const postId = await publish(ana);

    for (let i = 0; i < 3; i++) {
      await react(beto, postId, 'HEART').expect(200);
      await unreact(beto, postId).expect(200);
    }

    expect(await noticesOf(ana)).toEqual(['POST_REACTION']);
  });

  it('AC-8: cambiar de tipo no avisa de nuevo, y reaccionar a la propia no avisa', async () => {
    const ana = await signUp('ana');
    const beto = await signUp('beto');
    const postId = await publish(ana);

    await react(beto, postId, 'HEART').expect(200);
    await react(beto, postId, 'FIRE').expect(200);
    const own = await react(ana, postId, 'CLAP').expect(200);

    expect(own.body).toEqual({ reactionCount: 2, myReaction: 'CLAP' });
    expect(await noticesOf(ana)).toEqual(['POST_REACTION']);
    expect(await noticesOf(beto)).toEqual([]);
  });

  it('AC-9: las reacciones de una cuenta desactivada no cuentan', async () => {
    const ana = await signUp('ana');
    const beto = await signUp('beto');
    const postId = await publish(ana);

    await react(beto, postId, 'HEART').expect(200);
    await prisma.user.update({
      where: { id: beto.id },
      data: { deactivatedAt: new Date() },
    });

    const feed = await as(ana).get('/posts/feed').expect(200);
    expect(feed.body.items[0].reactionCount).toBe(0);
  });

  it('AC-10: un tipo fuera de los cinco da 400 y sin token da 401', async () => {
    const ana = await signUp('ana');
    const beto = await signUp('beto');
    const postId = await publish(ana);

    await react(beto, postId, 'ANGRY').expect(400);
    await as(beto).put(`/posts/${postId}/reaction`, {}).expect(400);
    await request(server)
      .put(`/api/v1/posts/${postId}/reaction`)
      .send({ type: 'HEART' })
      .expect(401);
    await request(server)
      .delete(`/api/v1/posts/${postId}/reaction`)
      .expect(401);
    expect(await prisma.postReaction.count()).toBe(0);
  });

  // Bug 1076: el autor ve quién reaccionó y con qué; nadie más.
  const reactors = (account: Account, postId: string, query = '') =>
    as(account).get(`/posts/${postId}/reactions${query}`);

  it('bug 1076: el autor ve quién reaccionó y con qué, igual que el conteo', async () => {
    const ana = await signUp('ana');
    const beto = await signUp('beto');
    const carla = await signUp('carla');
    const dani = await signUp('dani');
    const postId = await publish(ana);
    await react(beto, postId, 'HEART').expect(200);
    await react(carla, postId, 'LAUGH').expect(200);
    await react(dani, postId, 'FIRE').expect(200);
    await unreact(dani, postId).expect(200);

    const res = await reactors(ana, postId).expect(200);
    const seen = res.body.items.map(
      (r: { type: string; user: { handle: string; id: string } }) =>
        `${r.user.handle}:${r.type}`,
    );
    expect(seen.sort()).toEqual(['beto:HEART', 'carla:LAUGH']);
    expect(res.body.items[0].user).toHaveProperty('avatarUrl');
    expect(res.body.nextCursor).toBeNull();
    const feed = await as(ana).get('/posts/feed').expect(200);
    expect(feed.body.items[0].reactionCount).toBe(res.body.items.length);
  });

  it('bug 1076: quien no es el autor no ve la lista; pagina por cursor', async () => {
    const ana = await signUp('ana');
    const beto = await signUp('beto');
    const carla = await signUp('carla');
    const postId = await publish(ana);
    await react(beto, postId, 'HEART').expect(200);
    await react(carla, postId, 'WOW').expect(200);

    const denied = await reactors(beto, postId).expect(403);
    expect(denied.body.code).toBe('NOT_POST_AUTHOR');

    const first = await reactors(ana, postId, '?limit=1').expect(200);
    expect(first.body.items).toHaveLength(1);
    const second = await reactors(
      ana,
      postId,
      `?limit=1&cursor=${first.body.nextCursor}`,
    ).expect(200);
    expect(second.body.items).toHaveLength(1);
    expect(second.body.items[0].id).not.toBe(first.body.items[0].id);
    expect(second.body.nextCursor).toBeNull();

    await reactors(ana, MISSING_ID).expect(404);
  });
});
