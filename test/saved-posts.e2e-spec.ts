import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { resetDb } from './support/reset-db.js';

// Guardar publicaciones (funcionalidad 19, HU25) contra PostgreSQL real.
const PASSWORD = 'clave-segura-2026';

interface Account {
  id: string;
  token: string;
}

describe('Guardar publicaciones (e2e)', () => {
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

  const auth = (account: Account) => ({
    Authorization: `Bearer ${account.token}`,
    'User-Agent': 'cafeta-e2e',
  });

  const publish = async (account: Account, content: string) => {
    const res = await request(server)
      .post('/api/v1/posts')
      .set(auth(account))
      .send({ content })
      .expect(201);
    return res.body.id as string;
  };

  const save = (account: Account, postId: string) =>
    request(server).put(`/api/v1/posts/${postId}/save`).set(auth(account));

  const unsave = (account: Account, postId: string) =>
    request(server).delete(`/api/v1/posts/${postId}/save`).set(auth(account));

  const saved = (account: Account, query = '') =>
    request(server).get(`/api/v1/me/saved${query}`).set(auth(account));

  const contents = (res: { body: { items: { content: string }[] } }) =>
    res.body.items.map((p) => p.content);

  // La tarjeta de una publicación tal como la ve quien mira.
  const cardOf = async (viewer: Account, author: Account, postId: string) => {
    const res = await request(server)
      .get(`/api/v1/users/${author.id}/posts`)
      .set(auth(viewer))
      .expect(200);
    return res.body.items.find((p: { id: string }) => p.id === postId) as {
      savedByMe: boolean;
    };
  };

  it('HU25: guardar responde 204, la tarjeta trae savedByMe y la lista la incluye', async () => {
    const ana = await signUp('ana');
    const beto = await signUp('beto');
    const postId = await publish(ana, 'Resumen de cálculo');
    expect((await cardOf(beto, ana, postId)).savedByMe).toBe(false);

    await save(beto, postId).expect(204);

    expect((await cardOf(beto, ana, postId)).savedByMe).toBe(true);
    // savedByMe es de quien mira: la autora no la tiene guardada.
    expect((await cardOf(ana, ana, postId)).savedByMe).toBe(false);
    const list = await saved(beto).expect(200);
    expect(contents(list)).toEqual(['Resumen de cálculo']);
    expect(list.body.items[0]).toMatchObject({
      id: postId,
      savedByMe: true,
      author: { id: ana.id },
    });
  });

  it('guardar dos veces deja una sola fila activa', async () => {
    const ana = await signUp('ana');
    const beto = await signUp('beto');
    const postId = await publish(ana, 'Una vez');

    await save(beto, postId).expect(204);
    await save(beto, postId).expect(204);

    const rows = await prisma.savedPost.findMany({
      where: { userId: beto.id, postId },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].deactivatedAt).toBeNull();
  });

  it('quitar responde 204 aunque se repita o no estuviera guardada, y la publicación original no cambia', async () => {
    const ana = await signUp('ana');
    const beto = await signUp('beto');
    const postId = await publish(ana, 'Se queda');
    await unsave(beto, postId).expect(204);

    await save(beto, postId).expect(204);
    await unsave(beto, postId).expect(204);
    await unsave(beto, postId).expect(204);

    expect((await saved(beto).expect(200)).body.items).toEqual([]);
    expect((await cardOf(beto, ana, postId)).savedByMe).toBe(false);
    const post = await prisma.post.findUniqueOrThrow({ where: { id: postId } });
    expect(post).toMatchObject({
      content: 'Se queda',
      deactivatedAt: null,
      archivedAt: null,
    });
    // La fila se conserva con baja lógica.
    const row = await prisma.savedPost.findFirstOrThrow({
      where: { userId: beto.id, postId },
    });
    expect(row.deactivatedAt).not.toBeNull();
  });

  it('no se guarda una publicación propia: 400 CANNOT_SAVE_OWN_POST', async () => {
    const ana = await signUp('ana');
    const postId = await publish(ana, 'Mía');

    const res = await save(ana, postId).expect(400);

    expect(res.body.code).toBe('CANNOT_SAVE_OWN_POST');
    expect(await prisma.savedPost.count()).toBe(0);
  });

  it('una publicación que no se ve responde 404 POST_NOT_FOUND al guardar', async () => {
    const ana = await signUp('ana');
    const beto = await signUp('beto');
    const archivada = await publish(ana, 'Archivada');
    const desactivada = await publish(ana, 'Desactivada');
    await prisma.post.update({
      where: { id: archivada },
      data: { archivedAt: new Date() },
    });
    await prisma.post.update({
      where: { id: desactivada },
      data: { deactivatedAt: new Date() },
    });

    for (const id of [archivada, desactivada, randomUUID()]) {
      const res = await save(beto, id).expect(404);
      expect(res.body.code).toBe('POST_NOT_FOUND');
    }
    await save(beto, 'no-es-uuid').expect(400);
    expect(await prisma.savedPost.count()).toBe(0);
  });

  it('si la autora solo deja ver su contenido a seguidores, quien no la sigue recibe 404', async () => {
    const ana = await signUp('ana');
    const beto = await signUp('beto');
    const postId = await publish(ana, 'Solo seguidores');
    await request(server)
      .patch('/api/v1/me/privacy')
      .set(auth(ana))
      .send({ visibility: 'FOLLOWERS' })
      .expect(200);

    await save(beto, postId).expect(404);

    await prisma.follow.create({
      data: { followerId: beto.id, followingId: ana.id, status: 'ACCEPTED' },
    });
    await save(beto, postId).expect(204);
  });

  it('la lista va de la guardada más reciente a la más antigua y volver a guardar la sube al inicio', async () => {
    const ana = await signUp('ana');
    const beto = await signUp('beto');
    const uno = await publish(ana, 'Uno');
    const dos = await publish(ana, 'Dos');
    const tres = await publish(ana, 'Tres');
    for (const id of [uno, dos, tres]) await save(beto, id).expect(204);
    expect(contents(await saved(beto).expect(200))).toEqual([
      'Tres',
      'Dos',
      'Uno',
    ]);

    await unsave(beto, uno).expect(204);
    await save(beto, uno).expect(204);

    expect(contents(await saved(beto).expect(200))).toEqual([
      'Uno',
      'Tres',
      'Dos',
    ]);
  });

  it('omite lo que dejó de verse y vuelve solo si vuelve a verse', async () => {
    const ana = await signUp('ana');
    const beto = await signUp('beto');
    const carla = await signUp('carla');
    const dani = await signUp('dani');
    const deAna = await publish(ana, 'De Ana');
    const deCarla = await publish(carla, 'De Carla');
    const deDani = await publish(dani, 'De Dani');
    for (const id of [deAna, deCarla, deDani]) await save(beto, id).expect(204);
    expect(contents(await saved(beto).expect(200))).toHaveLength(3);

    // Publicación archivada, autora desactivada y una persona que me bloqueó.
    await prisma.post.update({
      where: { id: deAna },
      data: { archivedAt: new Date() },
    });
    await prisma.user.update({
      where: { id: carla.id },
      data: { deactivatedAt: new Date() },
    });
    await prisma.block.create({
      data: { blockerId: dani.id, blockedId: beto.id },
    });
    expect((await saved(beto).expect(200)).body.items).toEqual([]);

    // Vuelve la publicación archivada y la cuenta desactivada.
    await prisma.post.update({
      where: { id: deAna },
      data: { archivedAt: null },
    });
    await prisma.user.update({
      where: { id: carla.id },
      data: { deactivatedAt: null },
    });
    expect(contents(await saved(beto).expect(200))).toEqual([
      'De Carla',
      'De Ana',
    ]);
  });

  it('quitar se puede aunque la publicación ya no se vea', async () => {
    const ana = await signUp('ana');
    const beto = await signUp('beto');
    const postId = await publish(ana, 'Se archiva');
    await save(beto, postId).expect(204);
    await prisma.post.update({
      where: { id: postId },
      data: { archivedAt: new Date() },
    });

    await unsave(beto, postId).expect(204);

    const row = await prisma.savedPost.findFirstOrThrow({
      where: { userId: beto.id, postId },
    });
    expect(row.deactivatedAt).not.toBeNull();
  });

  it('la lista se pagina con cursor y rechaza uno inexistente', async () => {
    const ana = await signUp('ana');
    const beto = await signUp('beto');
    const ids: string[] = [];
    for (const name of ['Uno', 'Dos', 'Tres']) {
      const id = await publish(ana, name);
      await save(beto, id).expect(204);
      ids.push(id);
    }

    const first = await saved(beto, '?limit=2').expect(200);
    expect(contents(first)).toEqual(['Tres', 'Dos']);
    expect(first.body.nextCursor).not.toBeNull();
    const second = await saved(
      beto,
      `?limit=2&cursor=${first.body.nextCursor}`,
    ).expect(200);
    expect(contents(second)).toEqual(['Uno']);
    expect(second.body.nextCursor).toBeNull();

    const invalid = await saved(beto, `?cursor=${randomUUID()}`).expect(400);
    expect(invalid.body.code).toBe('INVALID_CURSOR');
  });

  it('cada quien ve solo sus guardadas', async () => {
    const ana = await signUp('ana');
    const beto = await signUp('beto');
    const carla = await signUp('carla');
    const postId = await publish(ana, 'De Ana');
    await save(beto, postId).expect(204);

    expect((await saved(carla).expect(200)).body.items).toEqual([]);
    expect((await cardOf(carla, ana, postId)).savedByMe).toBe(false);
  });

  it('exige sesión', async () => {
    const id = randomUUID();
    await request(server).put(`/api/v1/posts/${id}/save`).expect(401);
    await request(server).delete(`/api/v1/posts/${id}/save`).expect(401);
    await request(server).get('/api/v1/me/saved').expect(401);
  });
});
