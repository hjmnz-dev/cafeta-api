import { Test, TestingModule } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';

describe('API (e2e)', () => {
  let app: NestExpressApplication;
  let server: App;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();
    server = app.getHttpServer();
  });

  afterAll(async () => {
    await app.close();
  });

  // Con la base arriba responde 200; sin base, 503. Las dos respuestas tienen forma fija.
  it('GET /api/v1/health informa el estado de la base', async () => {
    const res = await request(server).get('/api/v1/health');
    if (res.status === 200) {
      // Sin version.txt (local y CI) la API reporta `dev`; en producción, el commit.
      expect(res.body).toEqual({ status: 'ok', db: 'up', version: 'dev' });
    } else {
      expect(res.status).toBe(503);
      expect(res.body).toMatchObject({
        statusCode: 503,
        code: 'DATABASE_UNAVAILABLE',
      });
    }
  });

  it('una ruta inexistente responde con la forma de error común', async () => {
    const res = await request(server).get('/api/v1/no-existe').expect(404);
    expect(res.body).toMatchObject({ statusCode: 404, code: 'NOT_FOUND' });
  });

  it('las rutas de prueba de las e2e no existen en la app de producción', async () => {
    await request(server).get('/api/v1/__probe__/careers').expect(404);
  });

  it('las rutas viven bajo /api/v1', async () => {
    await request(server).get('/health').expect(404);
  });

  it('publica el contrato OpenAPI en /api/docs-json', async () => {
    const res = await request(server).get('/api/docs-json').expect(200);
    expect(res.body.openapi).toMatch(/^3\./);
    expect(res.body.paths).toHaveProperty('/api/v1/health');
  });
});
