import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { resetDb } from './support/reset-db.js';

// Desactivar mi cuenta (HU05, HU06; spec 0009 decisión 11) contra PostgreSQL real.
const PASSWORD = 'clave-segura-2026';

interface Account {
  id: string;
  email: string;
  token: string;
}

describe('Desactivar mi cuenta (e2e)', () => {
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
    const email = `${handle}@est.intec.edu.do`;
    const res = await request(server)
      .post('/api/v1/auth/register')
      .send({
        email,
        password: PASSWORD,
        firstName: handle,
        lastName: 'Prueba',
        handle,
        careerId,
        acceptTerms: true,
      })
      .expect(201);
    return { id: res.body.user.id, email, token: res.body.accessToken };
  };

  const login = (email: string, password = PASSWORD) =>
    request(server).post('/api/v1/auth/login').send({ email, password });

  const get = (token: string, path: string) =>
    request(server)
      .get(`/api/v1${path}`)
      .set('Authorization', `Bearer ${token}`);

  const deactivate = (token: string, password: unknown) =>
    request(server)
      .post('/api/v1/me/deactivate')
      .set('Authorization', `Bearer ${token}`)
      .set('User-Agent', 'cafeta-e2e')
      .send({ password });

  it('GET /auth/me trae la fecha de registro para "miembro desde" (HU06 E1)', async () => {
    const ana = await signUp('ana');

    const res = await get(ana.token, '/auth/me').expect(200);

    expect(new Date(res.body.createdAt).toISOString()).toBe(res.body.createdAt);
    expect(res.body.email).toBe(ana.email);
  });

  it('con la contraseña correcta desactiva la cuenta y conserva su historial (HU05 E1)', async () => {
    const ana = await signUp('ana');
    await prisma.post.create({
      data: { authorId: ana.id, content: 'mi publicación', type: 'TEXT' },
    });

    await deactivate(ana.token, PASSWORD).expect(204);

    const user = await prisma.user.findUniqueOrThrow({
      where: { id: ana.id },
    });
    expect(user.deactivatedAt).not.toBeNull();
    expect(await prisma.post.count({ where: { authorId: ana.id } })).toBe(1);
  });

  it('sin la contraseña correcta no cambia nada (HU05 E2)', async () => {
    const ana = await signUp('ana');

    const wrong = await deactivate(ana.token, 'otra-clave-1').expect(403);
    expect(wrong.body.code).toBe('INVALID_PASSWORD');
    await deactivate(ana.token, undefined).expect(400);

    await get(ana.token, '/auth/me').expect(200);
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: ana.id },
    });
    expect(user.deactivatedAt).toBeNull();
    expect(
      await prisma.auditLog.count({ where: { action: 'account.deactivate' } }),
    ).toBe(0);
  });

  it('pide sesión', async () => {
    await request(server)
      .post('/api/v1/me/deactivate')
      .send({ password: PASSWORD })
      .expect(401);
  });

  it('cierra todas las sesiones y ya no se puede iniciar sesión', async () => {
    const ana = await signUp('ana');
    const second = await login(ana.email).expect(200);

    await deactivate(ana.token, PASSWORD).expect(204);

    await get(ana.token, '/auth/me').expect(401);
    await get(second.body.accessToken, '/auth/me').expect(401);
    expect(
      await prisma.session.count({
        where: { userId: ana.id, revokedAt: null },
      }),
    ).toBe(0);
    const again = await login(ana.email).expect(403);
    expect(again.body.code).toBe('ACCOUNT_INACTIVE');
  });

  it('deja de verse: perfil 404, sus publicaciones salen del feed de quien la seguía', async () => {
    const ana = await signUp('ana');
    const beto = await signUp('beto');
    await prisma.follow.create({
      data: { followerId: beto.id, followingId: ana.id, status: 'ACCEPTED' },
    });
    await prisma.post.create({
      data: { authorId: ana.id, content: 'hola desde ana', type: 'TEXT' },
    });
    const before = await get(beto.token, '/posts/feed').expect(200);
    expect(before.body.items).toHaveLength(1);

    await deactivate(ana.token, PASSWORD).expect(204);

    const profile = await get(beto.token, `/users/${ana.id}/profile`).expect(
      404,
    );
    expect(profile.body.code).toBe('USER_NOT_FOUND');
    const after = await get(beto.token, '/posts/feed').expect(200);
    expect(after.body.items).toHaveLength(0);
  });

  it('queda auditado con by: self', async () => {
    const ana = await signUp('ana');

    await deactivate(ana.token, PASSWORD).expect(204);

    const entry = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'account.deactivate' },
    });
    expect(entry).toMatchObject({
      actorId: ana.id,
      entityType: 'user',
      entityId: ana.id,
      succeeded: true,
      userAgent: 'cafeta-e2e',
      metadata: { by: 'self' },
    });
  });

  it('un administrador no puede desactivar su propia cuenta', async () => {
    const admin = await signUp('admin_uno');
    await prisma.user.update({
      where: { id: admin.id },
      data: { role: 'ADMIN' },
    });

    const res = await deactivate(admin.token, PASSWORD).expect(403);

    expect(res.body.code).toBe('ADMIN_CANNOT_SELF_DEACTIVATE');
    await get(admin.token, '/auth/me').expect(200);
  });
});
