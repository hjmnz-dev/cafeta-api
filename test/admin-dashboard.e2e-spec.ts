import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { resetDb } from './support/reset-db.js';

// Dashboard del admin (spec 0008, decisión 31) contra PostgreSQL real.
const PASSWORD = 'clave-segura-2026';
const ROUTE = '/api/v1/admin/dashboard';
const DAY = 24 * 60 * 60 * 1000;

describe('Dashboard admin (e2e)', () => {
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
    careerId = (await prisma.career.create({ data: { name: 'Carrera' } })).id;
  });

  const signUp = async (handle: string) => {
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
    return { id: res.body.user.id as string, token: res.body.accessToken };
  };

  const signUpAdmin = async (handle: string) => {
    const admin = await signUp(handle);
    await prisma.user.update({
      where: { id: admin.id },
      data: { role: 'ADMIN' },
    });
    return admin;
  };

  const get = (token: string) =>
    request(server).get(ROUTE).set('Authorization', `Bearer ${token}`);

  it('AC-1: un admin recibe las métricas reales', async () => {
    const admin = await signUpAdmin('admin');
    const ana = await signUp('ana');
    const beto = await signUp('beto');
    await prisma.user.update({
      where: { id: beto.id },
      data: { createdAt: new Date(Date.now() - 30 * DAY) },
    });
    const old = await signUp('vieja');
    await prisma.user.update({
      where: { id: old.id },
      data: { deactivatedAt: new Date(), verificationStatus: 'VERIFIED' },
    });

    const mk = (authorId: string, extra: object = {}) =>
      prisma.post.create({
        data: { authorId, content: 'hola', ...extra },
      });
    await mk(ana.id);
    await mk(beto.id, { createdAt: new Date(Date.now() - 20 * DAY) });
    await mk(ana.id, { archivedAt: new Date() });
    await mk(ana.id, { deactivatedAt: new Date() });

    const story = (extra: object) =>
      prisma.story.create({
        data: {
          authorId: ana.id,
          text: 'hi',
          expiresAt: new Date(Date.now() + DAY),
          ...extra,
        },
      });
    await story({});
    await story({ expiresAt: new Date(Date.now() - 1000) });
    await story({ deactivatedAt: new Date() });

    await prisma.report.create({
      data: {
        reporterId: ana.id,
        targetType: 'USER',
        targetUserId: beto.id,
        reason: 'SPAM',
        pendingKey: `USER:${beto.id}`,
      },
    });
    await prisma.report.create({
      data: {
        reporterId: beto.id,
        targetType: 'USER',
        targetUserId: ana.id,
        reason: 'SPAM',
        status: 'DISMISSED',
      },
    });

    const res = await get(admin.token).expect(200);
    expect(res.body).toMatchObject({
      users: { total: 2, last7Days: 1 },
      posts: { total: 2, last7Days: 1 },
      activeStories: 1,
      pendingReports: 1,
      pendingVerifications: 2,
    });
    expect(Date.parse(res.body.generatedAt)).not.toBeNaN();
  });

  it('AC-2: un estudiante recibe 403 FORBIDDEN y queda access.denied', async () => {
    const ana = await signUp('ana');
    const res = await get(ana.token).expect(403);
    expect(res.body.code).toBe('FORBIDDEN');
    expect(res.body).not.toHaveProperty('users');

    const entry = await prisma.auditLog.findFirst({
      where: { action: 'access.denied', actorId: ana.id },
    });
    expect(entry?.succeeded).toBe(false);
  });

  it('AC-3: sin sesión responde 401', async () => {
    await request(server).get(ROUTE).expect(401);
  });

  it('AC-4: el login de un admin devuelve role ADMIN', async () => {
    await signUpAdmin('admin');
    const res = await request(server)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@est.intec.edu.do', password: PASSWORD })
      .expect(200);
    expect(res.body.user.role).toBe('ADMIN');
  });
});
