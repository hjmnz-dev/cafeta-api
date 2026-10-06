import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { resetDb } from './support/reset-db.js';

const PASSWORD = 'clave-segura-2026';

interface Account {
  id: string;
  token: string;
}

describe('Seguir y seguidores (e2e)', () => {
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

  const auth = (token: string) => ({
    Authorization: `Bearer ${token}`,
  });

  it('seguir a perfil público queda ACCEPTED de inmediato', async () => {
    const ana = await signUp('ana');
    const bob = await signUp('bob');

    const res = await request(server)
      .post(`/api/v1/users/${bob.id}/follow`)
      .set(auth(ana.token))
      .expect(201);

    expect(res.body).toMatchObject({ status: 'ACCEPTED' });

    const followersRes = await request(server)
      .get(`/api/v1/users/${bob.id}/followers`)
      .set(auth(ana.token))
      .expect(200);

    expect(followersRes.body.items).toHaveLength(1);
    expect(followersRes.body.items[0]).toMatchObject({ handle: 'ana' });
  });

  it('seguir a perfil FOLLOWERS queda PENDING y se puede aceptar', async () => {
    const ana = await signUp('ana');
    const bob = await signUp('bob');

    await request(server)
      .patch('/api/v1/me/privacy')
      .set(auth(bob.token))
      .send({ visibility: 'FOLLOWERS' })
      .expect(200);

    const followRes = await request(server)
      .post(`/api/v1/users/${bob.id}/follow`)
      .set(auth(ana.token))
      .expect(201);

    expect(followRes.body).toMatchObject({ status: 'PENDING' });

    // Bob ve la solicitud pendiente
    const requestsRes = await request(server)
      .get('/api/v1/follows/requests')
      .set(auth(bob.token))
      .expect(200);

    expect(requestsRes.body.items).toHaveLength(1);
    expect(requestsRes.body.items[0].follower).toMatchObject({ handle: 'ana' });

    // Bob la acepta
    await request(server)
      .post(`/api/v1/follows/${requestsRes.body.items[0].id}/accept`)
      .set(auth(bob.token))
      .expect(204);

    // Ahora Ana figura en sus seguidores
    const followersRes = await request(server)
      .get(`/api/v1/users/${bob.id}/followers`)
      .set(auth(ana.token))
      .expect(200);

    expect(followersRes.body.items).toHaveLength(1);
  });

  it('dejar de seguir desactiva la relación', async () => {
    const ana = await signUp('ana');
    const bob = await signUp('bob');

    await request(server)
      .post(`/api/v1/users/${bob.id}/follow`)
      .set(auth(ana.token))
      .expect(201);

    await request(server)
      .delete(`/api/v1/users/${bob.id}/follow`)
      .set(auth(ana.token))
      .expect(204);

    const followersRes = await request(server)
      .get(`/api/v1/users/${bob.id}/followers`)
      .set(auth(ana.token))
      .expect(200);

    expect(followersRes.body.items).toHaveLength(0);
  });
});
