import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import { resetDb } from './support/reset-db.js';

// Límite de comentarios por usuario (spec 0009, decisión 21), separado del de
// publicar y del de auth. Igual que en posts-rate-limit.e2e-spec.ts, el límite
// se fija antes de importar AppModule.
const COMMENT_LIMIT = 3;
const PASSWORD = 'clave-segura-2026';
const SHARED_IP = '198.51.100.9';

describe('Límite de comentarios (e2e)', () => {
  let app: NestExpressApplication;
  let server: App;
  let prisma: PrismaService;
  let careerId: string;
  const previous = process.env.COMMENT_RATE_LIMIT;

  beforeAll(async () => {
    process.env.COMMENT_RATE_LIMIT = String(COMMENT_LIMIT);
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
    if (previous === undefined) delete process.env.COMMENT_RATE_LIMIT;
    else process.env.COMMENT_RATE_LIMIT = previous;
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

  const as = (token: string) => ({
    Authorization: `Bearer ${token}`,
    'X-Forwarded-For': SHARED_IP,
  });

  it('el comentario de más en un minuto da 429 solo a ese usuario, y publicar y desactivar no gastan el límite', async () => {
    const ana = await signUp('ana');
    const beto = await signUp('beto');
    const post = await request(server)
      .post('/api/v1/posts')
      .set(as(ana))
      .send({ content: 'Hola' })
      .expect(201);
    const url = `/api/v1/posts/${post.body.id}/comments`;
    const send = (token: string) =>
      request(server).post(url).set(as(token)).send({ content: 'Hola' });

    let first = '';
    for (let i = 0; i < COMMENT_LIMIT; i++) {
      const res = await send(ana).expect(201);
      if (i === 0) first = res.body.id;
    }
    const blocked = await send(ana).expect(429);
    expect(blocked.body).toMatchObject({
      statusCode: 429,
      code: 'TOO_MANY_REQUESTS',
    });

    // Otra persona, la misma IP: su propio límite.
    await send(beto).expect(201);
    // Publicar tiene su límite; desactivar y leer no tienen ninguno.
    await request(server)
      .post('/api/v1/posts')
      .set(as(ana))
      .send({ content: 'Otra' })
      .expect(201);
    await request(server)
      .post(`${url}/${first}/deactivate`)
      .set(as(ana))
      .expect(204);
    await request(server).get(url).set(as(ana)).expect(200);
    expect(await prisma.postComment.count()).toBe(COMMENT_LIMIT + 1);
  });
});
