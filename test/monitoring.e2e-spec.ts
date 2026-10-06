import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { ErrorReporter } from '../src/common/monitoring/error-reporter.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { resetDb } from './support/reset-db.js';

// Endpoint de prueba del monitoreo (spec 0007, AC-4) contra PostgreSQL real.
const PASSWORD = 'clave-segura-2026';
const ROUTE = '/api/v1/monitoring/test-error';

describe('Monitoreo (e2e)', () => {
  let app: NestExpressApplication;
  let server: App;
  let prisma: PrismaService;
  const report = vi.fn();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ErrorReporter)
      .useValue({ report })
      .compile();
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
    report.mockClear();
  });

  const signUp = async (handle: string) => {
    const career = await prisma.career.create({
      data: { name: `Carrera ${handle}` },
    });
    const res = await request(server)
      .post('/api/v1/auth/register')
      .send({
        email: `${handle}@est.intec.edu.do`,
        password: PASSWORD,
        firstName: handle,
        lastName: 'Prueba',
        handle,
        careerId: career.id,
        acceptTerms: true,
      })
      .expect(201);
    return { id: res.body.user.id as string, token: res.body.accessToken };
  };

  it('un admin recibe 500, queda en la bitácora y se reporta con la ruta', async () => {
    const admin = await signUp('admin');
    await prisma.user.update({
      where: { id: admin.id },
      data: { role: 'ADMIN' },
    });

    const res = await request(server)
      .post(ROUTE)
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(500);
    expect(res.body).toEqual({
      statusCode: 500,
      message: 'Error interno del servidor',
      code: 'INTERNAL_SERVER_ERROR',
    });

    const entry = await prisma.auditLog.findFirst({
      where: { action: 'monitoring.test' },
    });
    expect(entry).toMatchObject({
      actorId: admin.id,
      entityType: 'monitoring',
      succeeded: true,
    });

    expect(report).toHaveBeenCalledTimes(1);
    const [error, context] = report.mock.calls[0];
    expect((error as Error).message).toBe(
      'Prueba de monitoreo forzada por un admin',
    );
    expect(context).toEqual({
      userId: admin.id,
      method: 'POST',
      route: ROUTE,
      code: 'INTERNAL_SERVER_ERROR',
    });
  });

  it('un estudiante recibe 403 y queda access.denied', async () => {
    const student = await signUp('estudiante');
    const res = await request(server)
      .post(ROUTE)
      .set('Authorization', `Bearer ${student.token}`)
      .expect(403);
    expect(res.body.code).toBe('FORBIDDEN');
    const denied = await prisma.auditLog.findFirst({
      where: { action: 'access.denied', actorId: student.id },
    });
    expect(denied).not.toBeNull();
    expect(
      await prisma.auditLog.count({ where: { action: 'monitoring.test' } }),
    ).toBe(0);
    expect(report).not.toHaveBeenCalled();
  });

  it('sin sesión responde 401', async () => {
    await request(server).post(ROUTE).expect(401);
    expect(report).not.toHaveBeenCalled();
  });
});
