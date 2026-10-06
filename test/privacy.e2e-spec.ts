import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { resetDb } from './support/reset-db.js';

// Privacidad de la cuenta (decisión 15, HU07 y HU09 E2) contra PostgreSQL real.
const PASSWORD = 'clave-segura-2026';

interface Account {
  id: string;
  token: string;
}

type Visibility = 'PUBLIC' | 'FOLLOWERS' | 'PRIVATE';

describe('Privacidad de la cuenta (e2e)', () => {
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

  const get = (account: Account, path: string) =>
    request(server)
      .get(`/api/v1${path}`)
      .set('Authorization', `Bearer ${account.token}`);

  const setPrivacy = (account: Account, visibility: Visibility) =>
    request(server)
      .patch('/api/v1/me/privacy')
      .set('Authorization', `Bearer ${account.token}`)
      .set('User-Agent', 'cafeta-e2e')
      .send({ visibility });

  const follow = (
    followerId: string,
    followingId: string,
    status: 'ACCEPTED' | 'PENDING',
  ) => prisma.follow.create({ data: { followerId, followingId, status } });

  const seedPost = (authorId: string, content: string) =>
    prisma.post.create({ data: { authorId, content, type: 'TEXT' } });

  const feedContents = async (account: Account, query = '') => {
    const res = await get(account, `/posts/feed${query}`).expect(200);
    return (res.body.items as { content: string }[]).map((p) => p.content);
  };

  // Bio y etiquetas para distinguir el perfil completo del limitado.
  const fillProfile = (userId: string) =>
    prisma.profile.update({
      where: { userId },
      data: {
        bio: 'Me gusta programar',
        tags: { create: [{ label: 'React', category: 'SKILL', position: 0 }] },
      },
    });

  it('las cuentas nuevas empiezan en PUBLIC', async () => {
    const ana = await signUp('ana');
    const res = await get(ana, '/me/privacy').expect(200);
    expect(res.body).toEqual({ visibility: 'PUBLIC' });
  });

  it('HU07 E1 y E2: cambiar a FOLLOWERS se guarda, se mantiene al volver y se audita', async () => {
    const ana = await signUp('ana');

    const res = await setPrivacy(ana, 'FOLLOWERS').expect(200);
    expect(res.body).toEqual({ visibility: 'FOLLOWERS' });

    const again = await get(ana, '/me/privacy').expect(200);
    expect(again.body).toEqual({ visibility: 'FOLLOWERS' });
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'privacy.update' },
    });
    expect(audit).toMatchObject({
      entityType: 'profile',
      entityId: ana.id,
      actorId: ana.id,
      succeeded: true,
      metadata: { from: 'PUBLIC', to: 'FOLLOWERS' },
    });
  });

  it('guardar la misma opción no vuelve a auditar', async () => {
    const ana = await signUp('ana');
    await setPrivacy(ana, 'PUBLIC').expect(200);
    expect(
      await prisma.auditLog.count({ where: { action: 'privacy.update' } }),
    ).toBe(0);
  });

  it('una opción que no existe responde 400', async () => {
    const ana = await signUp('ana');
    const res = await request(server)
      .patch('/api/v1/me/privacy')
      .set('Authorization', `Bearer ${ana.token}`)
      .send({ visibility: 'SECRET' })
      .expect(400);
    expect(res.body.code).toBeDefined();
  });

  it('HU09 E1: un perfil PUBLIC se ve completo, con Seguir y sus publicaciones', async () => {
    const ana = await signUp('ana');
    const beto = await signUp('beto');
    await fillProfile(beto.id);
    await seedPost(beto.id, 'hola');

    const res = await get(ana, `/users/${beto.id}/profile`).expect(200);
    expect(res.body).toMatchObject({
      id: beto.id,
      handle: 'beto',
      displayName: 'beto Prueba',
      careerName: 'Ingeniería de Software',
      visibility: 'PUBLIC',
      isSelf: false,
      canSeeContent: true,
      followStatus: 'NONE',
      canFollow: true,
      bio: 'Me gusta programar',
      tags: [{ label: 'React', category: 'SKILL' }],
      counts: { posts: 1, followers: 0, following: 0 },
    });
    await get(ana, `/users/${beto.id}/posts`).expect(200);
  });

  it('HU07 E2 y HU09 E2: con FOLLOWERS, quien no sigue ve el perfil limitado y ningún contenido', async () => {
    const ana = await signUp('ana');
    const beto = await signUp('beto');
    await fillProfile(beto.id);
    await seedPost(beto.id, 'solo para seguidores');
    await setPrivacy(beto, 'FOLLOWERS').expect(200);

    const res = await get(ana, `/users/${beto.id}/profile`).expect(200);
    expect(res.body).toMatchObject({
      handle: 'beto',
      careerName: 'Ingeniería de Software',
      canSeeContent: false,
      canFollow: true,
      bio: null,
      tags: [],
      counts: { posts: 1, followers: 0, following: 0 },
    });
    const posts = await get(ana, `/users/${beto.id}/posts`).expect(403);
    expect(posts.body.code).toBe('PROFILE_RESTRICTED');
    expect(await feedContents(ana, `?careerId=${careerId}`)).toEqual([]);
  });

  it('con FOLLOWERS, una solicitud pendiente todavía no da acceso', async () => {
    const ana = await signUp('ana');
    const beto = await signUp('beto');
    await setPrivacy(beto, 'FOLLOWERS').expect(200);
    await follow(ana.id, beto.id, 'PENDING');

    const res = await get(ana, `/users/${beto.id}/profile`).expect(200);
    expect(res.body).toMatchObject({
      canSeeContent: false,
      followStatus: 'PENDING',
    });
  });

  it('con FOLLOWERS, un seguidor aceptado ve todo, también en el feed', async () => {
    const ana = await signUp('ana');
    const beto = await signUp('beto');
    await fillProfile(beto.id);
    await seedPost(beto.id, 'para mis seguidores');
    await setPrivacy(beto, 'FOLLOWERS').expect(200);
    await follow(ana.id, beto.id, 'ACCEPTED');

    const res = await get(ana, `/users/${beto.id}/profile`).expect(200);
    expect(res.body).toMatchObject({
      canSeeContent: true,
      followStatus: 'ACCEPTED',
      bio: 'Me gusta programar',
      counts: { followers: 1 },
    });
    await get(ana, `/users/${beto.id}/posts`).expect(200);
    expect(await feedContents(ana)).toEqual(['para mis seguidores']);
    expect(await feedContents(ana, `?careerId=${careerId}`)).toEqual([
      'para mis seguidores',
    ]);
  });

  it('con PRIVATE, ni los seguidores ven el contenido, no hay botón Seguir y el seguimiento no se borra', async () => {
    const ana = await signUp('ana');
    const beto = await signUp('beto');
    await seedPost(beto.id, 'solo mío');
    await follow(ana.id, beto.id, 'ACCEPTED');
    await setPrivacy(beto, 'PRIVATE').expect(200);

    const res = await get(ana, `/users/${beto.id}/profile`).expect(200);
    expect(res.body).toMatchObject({
      visibility: 'PRIVATE',
      canSeeContent: false,
      canFollow: false,
      followStatus: 'ACCEPTED',
    });
    await get(ana, `/users/${beto.id}/posts`).expect(403);
    expect(await feedContents(ana)).toEqual([]);
    const row = await prisma.follow.findFirstOrThrow({
      where: { followerId: ana.id },
    });
    expect(row).toMatchObject({ status: 'ACCEPTED', deactivatedAt: null });
  });

  it('el dueño siempre ve su perfil completo y su contenido, aunque sea PRIVATE', async () => {
    const beto = await signUp('beto');
    await fillProfile(beto.id);
    await seedPost(beto.id, 'mío');
    await setPrivacy(beto, 'PRIVATE').expect(200);

    const res = await get(beto, `/users/${beto.id}/profile`).expect(200);
    expect(res.body).toMatchObject({
      isSelf: true,
      canSeeContent: true,
      canFollow: false,
      bio: 'Me gusta programar',
    });
    expect(await feedContents(beto)).toEqual(['mío']);
  });

  it('al pasar a PUBLIC, las solicitudes pendientes se aceptan solas y se auditan', async () => {
    const ana = await signUp('ana');
    const beto = await signUp('beto');
    await setPrivacy(beto, 'FOLLOWERS').expect(200);
    const pending = await follow(ana.id, beto.id, 'PENDING');

    await setPrivacy(beto, 'PUBLIC').expect(200);

    const row = await prisma.follow.findUniqueOrThrow({
      where: { id: pending.id },
    });
    expect(row.status).toBe('ACCEPTED');
    expect(row.respondedAt).not.toBeNull();
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'follow.accept' },
    });
    expect(audit).toMatchObject({
      entityId: pending.id,
      actorId: beto.id,
      metadata: { followerId: ana.id, automatic: true },
    });
  });

  it('un bloqueo en cualquier dirección hace que el perfil no exista', async () => {
    const ana = await signUp('ana');
    const beto = await signUp('beto');
    await seedPost(beto.id, 'de beto');
    await prisma.block.create({
      data: { blockerId: beto.id, blockedId: ana.id },
    });

    const res = await get(ana, `/users/${beto.id}/profile`).expect(404);
    expect(res.body.code).toBe('USER_NOT_FOUND');
    await get(ana, `/users/${beto.id}/posts`).expect(404);
    expect(await feedContents(ana, `?careerId=${careerId}`)).toEqual([]);
    await get(beto, `/users/${ana.id}/profile`).expect(404);
  });

  it('un usuario que no existe responde USER_NOT_FOUND', async () => {
    const ana = await signUp('ana');
    const res = await get(
      ana,
      '/users/01926f00-0000-7000-8000-00000000ffff/profile',
    ).expect(404);
    expect(res.body.code).toBe('USER_NOT_FOUND');
  });

  it('sin token las rutas de privacidad y perfil responden 401', async () => {
    await request(server).get('/api/v1/me/privacy').expect(401);
    await request(server)
      .patch('/api/v1/me/privacy')
      .send({ visibility: 'PUBLIC' })
      .expect(401);
    await request(server)
      .get('/api/v1/users/01926f00-0000-7000-8000-00000000ffff/profile')
      .expect(401);
  });
});
