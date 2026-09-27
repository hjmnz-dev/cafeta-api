import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import { resetDb } from './support/reset-db.js';

// AC-12 (spec 0005): límite de publicaciones por usuario, separado del de auth
// por IP. Igual que en auth-rate-limit.e2e-spec.ts, los límites se fijan antes
// de importar AppModule. El de publicaciones es mayor que el de auth a
// propósito: si publicar pasara por el límite de auth, se cortaría antes.
const POST_LIMIT = 5;
const AUTH_LIMIT = 3;
const PASSWORD = 'clave-segura-2026';
const SHARED_IP = '198.51.100.7';

describe('Límite de publicaciones (e2e)', () => {
  let app: NestExpressApplication;
  let server: App;
  let prisma: PrismaService;
  let careerId: string;
  const previous = {
    post: process.env.POST_RATE_LIMIT,
    auth: process.env.AUTH_RATE_LIMIT,
  };

  beforeAll(async () => {
    process.env.POST_RATE_LIMIT = String(POST_LIMIT);
    process.env.AUTH_RATE_LIMIT = String(AUTH_LIMIT);
    const { AppModule } = await import('../src/app.module.js');
    const { configureApp } = await import('../src/app.setup.js');
    const { PrismaService } = await import('../src/prisma/prisma.service.js');
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();
    server = app.getHttpServer();
    prisma = app.get(PrismaService);
    await resetDb(prisma);
    careerId = (
      await prisma.career.create({ data: { name: 'Ingeniería de Software' } })
    ).id;
  });

  afterAll(async () => {
    await app.close();
    const restore = (name: string, value: string | undefined) => {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    };
    restore('POST_RATE_LIMIT', previous.post);
    restore('AUTH_RATE_LIMIT', previous.auth);
  });

  const signUp = async (handle: string): Promise<string> => {
    const res = await request(server)
      .post('/api/v1/auth/register')
      .set('X-Forwarded-For', SHARED_IP)
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
    return res.body.accessToken;
  };

  const publish = (token: string) =>
    request(server)
      .post('/api/v1/posts')
      .set('X-Forwarded-For', SHARED_IP)
      .set('Authorization', `Bearer ${token}`)
      .send({ content: 'Hola' });

  const login = () =>
    request(server)
      .post('/api/v1/auth/login')
      .set('X-Forwarded-For', SHARED_IP)
      .send({ email: 'ana@est.intec.edu.do', password: PASSWORD });

  it('AC-12: la publicación de más en un minuto da 429 solo a ese usuario, aunque compartan IP', async () => {
    const ana = await signUp('ana');
    const beto = await signUp('beto');

    // Más publicaciones que el límite de auth: publicar no usa ese límite.
    for (let i = 0; i < POST_LIMIT; i++) await publish(ana).expect(201);
    const blocked = await publish(ana).expect(429);
    expect(blocked.body).toMatchObject({
      statusCode: 429,
      code: 'TOO_MANY_REQUESTS',
    });

    await publish(beto).expect(201);
    expect(await prisma.post.count()).toBe(POST_LIMIT + 1);
  });

  it('AC-12: el login conserva su propio límite por IP, sin gastar el de publicar', async () => {
    // La IP compartida ya publicó 7 veces: el login igual tiene sus 3 intentos.
    for (let i = 0; i < AUTH_LIMIT; i++) await login().expect(200);
    const blocked = await login().expect(429);
    expect(blocked.body.code).toBe('TOO_MANY_REQUESTS');
  });
});
