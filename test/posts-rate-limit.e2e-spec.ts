import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import { resetDb } from './support/reset-db.js';

// AC-12 (spec 0005): límite de publicaciones por usuario. Igual que en
// auth-rate-limit.e2e-spec.ts, el límite se fija antes de importar AppModule.
const LIMIT = 2;
const PASSWORD = 'clave-segura-2026';
const SHARED_IP = '198.51.100.7';

describe('Límite de publicaciones (e2e)', () => {
  let app: NestExpressApplication;
  let server: App;
  let prisma: PrismaService;
  let careerId: string;
  const previous = process.env.POST_RATE_LIMIT;

  beforeAll(async () => {
    process.env.POST_RATE_LIMIT = String(LIMIT);
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
    if (previous === undefined) delete process.env.POST_RATE_LIMIT;
    else process.env.POST_RATE_LIMIT = previous;
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

  it('AC-12: la publicación de más en un minuto da 429 solo a ese usuario, aunque compartan IP', async () => {
    const ana = await signUp('ana');
    const beto = await signUp('beto');

    for (let i = 0; i < LIMIT; i++) await publish(ana).expect(201);
    const blocked = await publish(ana).expect(429);
    expect(blocked.body).toMatchObject({
      statusCode: 429,
      code: 'TOO_MANY_REQUESTS',
    });

    await publish(beto).expect(201);
    expect(await prisma.post.count()).toBe(LIMIT + 1);
  });

  it('AC-12: publicar no consume el límite de login, y login conserva el suyo por IP', async () => {
    // .env.test deja AUTH_RATE_LIMIT en 1000: el login desde la IP compartida
    // sigue entrando aunque esa IP ya publicó y se registró.
    const res = await request(server)
      .post('/api/v1/auth/login')
      .set('X-Forwarded-For', SHARED_IP)
      .send({ email: 'ana@est.intec.edu.do', password: PASSWORD });
    expect(res.status).toBe(200);
  });
});
