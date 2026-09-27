import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import type { App } from 'supertest/types.js';

// AC-11 (spec 0004): límite de intentos con el valor por defecto de producción.
// .env.test sube el límite a 1000 para las demás e2e; aquí se fija en 5 antes
// de importar AppModule, porque ConfigModule.forRoot lee el entorno al cargarse
// y una variable del proceso gana sobre la del archivo.
const LIMIT = 5;

describe('Límite de intentos en auth (e2e)', () => {
  let app: NestExpressApplication;
  let server: App;
  const previous = process.env.AUTH_RATE_LIMIT;

  beforeAll(async () => {
    process.env.AUTH_RATE_LIMIT = String(LIMIT);
    const { AppModule } = await import('../src/app.module.js');
    const { configureApp } = await import('../src/app.setup.js');
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();
    server = app.getHttpServer();
  });

  afterAll(async () => {
    await app.close();
    if (previous === undefined) delete process.env.AUTH_RATE_LIMIT;
    else process.env.AUTH_RATE_LIMIT = previous;
  });

  // Cada prueba simula su propia IP (trust proxy está activo) para no
  // heredar el contador de la anterior.
  const login = (ip: string) =>
    request(server)
      .post('/api/v1/auth/login')
      .set('X-Forwarded-For', ip)
      .send({ email: 'nadie@est.intec.edu.do', password: 'clave-segura-2026' });

  it('AC-11: el sexto login en un minuto desde una IP responde 429 TOO_MANY_REQUESTS', async () => {
    for (let i = 0; i < LIMIT; i++) {
      await login('203.0.113.1').expect(401);
    }
    const blocked = await login('203.0.113.1').expect(429);
    expect(blocked.body).toMatchObject({
      statusCode: 429,
      code: 'TOO_MANY_REQUESTS',
    });
  });

  it('AC-11: el límite es por IP, otra IP sigue entrando', async () => {
    for (let i = 0; i <= LIMIT; i++) await login('203.0.113.2');
    await login('203.0.113.2').expect(429);
    await login('203.0.113.3').expect(401);
  });

  it('AC-11: el registro también tiene límite, antes de validar el cuerpo', async () => {
    const register = () =>
      request(server)
        .post('/api/v1/auth/register')
        .set('X-Forwarded-For', '203.0.113.4')
        .send({});
    for (let i = 0; i < LIMIT; i++) await register().expect(400);
    const blocked = await register().expect(429);
    expect(blocked.body.code).toBe('TOO_MANY_REQUESTS');
  });

  it('AC-11: /auth/me no tiene límite de intentos', async () => {
    for (let i = 0; i <= LIMIT + 1; i++) {
      const res = await request(server)
        .get('/api/v1/auth/me')
        .set('X-Forwarded-For', '203.0.113.5')
        .expect(401);
      expect(res.body.code).toBe('UNAUTHORIZED');
    }
  });
});
