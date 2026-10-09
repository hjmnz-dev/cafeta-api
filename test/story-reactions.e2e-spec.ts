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

// Reaccionar a historias (funcionalidad 24, HU17) contra PostgreSQL real.
const PASSWORD = 'clave-segura-2026';
const PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d,
]);

interface Account {
  id: string;
  token: string;
}

interface TrayStory {
  id: string;
  myReaction: string | null;
  reactionCount: number | null;
}

describe('Reacciones a historias (e2e)', () => {
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

  const react = (account: Account, storyId: string, type: string) =>
    request(server)
      .put(`/api/v1/stories/${storyId}/reaction`)
      .set(auth(account))
      .send({ type });

  const unreact = (account: Account, storyId: string) =>
    request(server)
      .delete(`/api/v1/stories/${storyId}/reaction`)
      .set(auth(account));

  const follow = (follower: Account, following: Account) =>
    prisma.follow.create({
      data: {
        followerId: follower.id,
        followingId: following.id,
        status: 'ACCEPTED',
      },
    });

  // La historia tal como la ve quien mira en su bandeja.
  const cardOf = async (viewer: Account, storyId: string) => {
    const res = await request(server)
      .get('/api/v1/stories')
      .set(auth(viewer))
      .expect(200);
    const stories: TrayStory[] = res.body.groups.flatMap(
      (g: { stories: TrayStory[] }) => g.stories,
    );
    return stories.find((s) => s.id === storyId) as TrayStory;
  };

  const rows = (storyId: string) =>
    prisma.storyReaction.findMany({ where: { storyId } });

  it('AC-1: reaccionar responde 200 con mi reacción, sin conteo para quien no es el autor', async () => {
    const ana = await signUp('ana');
    const beto = await signUp('beto');
    await follow(beto, ana);
    const storyId = await publish(ana);

    const res = await react(beto, storyId, 'FIRE').expect(200);

    expect(res.body).toEqual({ myReaction: 'FIRE', reactionCount: null });
    expect(await cardOf(beto, storyId)).toMatchObject({
      myReaction: 'FIRE',
      reactionCount: null,
    });
  });

  it('AC-2: el autor ve el conteo en su historia y los demás no', async () => {
    const ana = await signUp('ana');
    const beto = await signUp('beto');
    const carla = await signUp('carla');
    await follow(beto, ana);
    await follow(carla, ana);
    const storyId = await publish(ana);
    await react(beto, storyId, 'HEART').expect(200);
    await react(carla, storyId, 'CLAP').expect(200);

    expect(await cardOf(ana, storyId)).toMatchObject({
      reactionCount: 2,
      myReaction: null,
    });
    expect(await cardOf(beto, storyId)).toMatchObject({ reactionCount: null });
    expect(await cardOf(carla, storyId)).toMatchObject({
      reactionCount: null,
    });
  });

  it('AC-3: repetir el mismo tipo deja una sola fila y cambiar de tipo reemplaza sin sumar', async () => {
    const ana = await signUp('ana');
    const beto = await signUp('beto');
    await follow(beto, ana);
    const storyId = await publish(ana);

    await react(beto, storyId, 'HEART').expect(200);
    await react(beto, storyId, 'HEART').expect(200);
    expect(await rows(storyId)).toHaveLength(1);

    const changed = await react(beto, storyId, 'WOW').expect(200);
    expect(changed.body.myReaction).toBe('WOW');
    expect(await rows(storyId)).toMatchObject([{ type: 'WOW' }]);
    expect(await cardOf(ana, storyId)).toMatchObject({ reactionCount: 1 });
  });

  it('AC-4: quitar baja el conteo, conserva la fila y quitar sin reacción no falla', async () => {
    const ana = await signUp('ana');
    const beto = await signUp('beto');
    await follow(beto, ana);
    const storyId = await publish(ana);
    await unreact(beto, storyId).expect(200);
    await react(beto, storyId, 'LAUGH').expect(200);

    const res = await unreact(beto, storyId).expect(200);

    expect(res.body).toEqual({ myReaction: null, reactionCount: null });
    const [row] = await rows(storyId);
    expect(row.deactivatedAt).not.toBeNull();
    expect(await cardOf(ana, storyId)).toMatchObject({ reactionCount: 0 });
    // Volver a reaccionar reactiva la misma fila.
    await react(beto, storyId, 'LAUGH').expect(200);
    expect(await rows(storyId)).toHaveLength(1);
    expect(await cardOf(ana, storyId)).toMatchObject({ reactionCount: 1 });
  });

  it('AC-5: dos toques simultáneos no duplican la reacción', async () => {
    const ana = await signUp('ana');
    const beto = await signUp('beto');
    await follow(beto, ana);
    const storyId = await publish(ana);

    await Promise.all([
      react(beto, storyId, 'HEART'),
      react(beto, storyId, 'HEART'),
      react(beto, storyId, 'FIRE'),
    ]);

    expect(await rows(storyId)).toHaveLength(1);
    expect(await prisma.notification.count()).toBeLessThanOrEqual(1);
  });

  it('AC-6: una historia que no se ve responde 404 STORY_NOT_FOUND', async () => {
    const ana = await signUp('ana');
    const beto = await signUp('beto');
    const carla = await signUp('carla');
    const dani = await signUp('dani');
    const vencida = await publish(ana);
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
    const bloqueada = await publish(dani);
    await prisma.block.create({
      data: { blockerId: dani.id, blockedId: beto.id },
    });

    for (const id of [vencida, desactivada, cerrada, bloqueada, randomUUID()]) {
      const res = await react(beto, id, 'HEART').expect(404);
      expect(res.body.code).toBe('STORY_NOT_FOUND');
      await unreact(beto, id).expect(404);
    }
    expect(await prisma.storyReaction.count()).toBe(0);
  });

  it('AC-7: reaccionar y quitar varias veces deja un solo aviso al autor', async () => {
    const ana = await signUp('ana');
    const beto = await signUp('beto');
    await follow(beto, ana);
    const storyId = await publish(ana);

    for (let i = 0; i < 3; i++) {
      await react(beto, storyId, 'HEART').expect(200);
      await unreact(beto, storyId).expect(200);
    }

    const avisos = await prisma.notification.findMany();
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toMatchObject({
      recipientId: ana.id,
      actorId: beto.id,
      type: 'STORY_REACTION',
      storyId,
    });
  });

  it('AC-8: cambiar de tipo no avisa de nuevo y reaccionar a la propia no avisa', async () => {
    const ana = await signUp('ana');
    const beto = await signUp('beto');
    await follow(beto, ana);
    const storyId = await publish(ana);

    await react(beto, storyId, 'HEART').expect(200);
    await react(beto, storyId, 'FIRE').expect(200);
    expect(await prisma.notification.count()).toBe(1);

    await react(ana, storyId, 'CLAP').expect(200);
    expect(await prisma.notification.count()).toBe(1);
  });

  it('AC-9: las reacciones de una cuenta desactivada no cuentan', async () => {
    const ana = await signUp('ana');
    const beto = await signUp('beto');
    const carla = await signUp('carla');
    await follow(beto, ana);
    await follow(carla, ana);
    const storyId = await publish(ana);
    await react(beto, storyId, 'HEART').expect(200);
    await react(carla, storyId, 'HEART').expect(200);
    await prisma.user.update({
      where: { id: carla.id },
      data: { deactivatedAt: new Date() },
    });

    expect(await cardOf(ana, storyId)).toMatchObject({ reactionCount: 1 });
  });

  it('AC-10: un tipo fuera de los cinco da 400 y sin token da 401', async () => {
    const ana = await signUp('ana');
    const beto = await signUp('beto');
    await follow(beto, ana);
    const storyId = await publish(ana);

    await react(beto, storyId, 'ANGRY').expect(400);
    await request(server)
      .put(`/api/v1/stories/${storyId}/reaction`)
      .send({ type: 'HEART' })
      .expect(401);
    await request(server)
      .delete(`/api/v1/stories/${storyId}/reaction`)
      .expect(401);
    expect(await prisma.storyReaction.count()).toBe(0);
  });
});
