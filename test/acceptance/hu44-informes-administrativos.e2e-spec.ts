import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../../src/app.module.js';
import { configureApp } from '../../src/app.setup.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { resetDb } from '../support/reset-db.js';

// Aceptación de HU44, "Generar reportes administrativos" (spec 0008, decisión
// 35). Un escenario Gherkin por prueba, con su id en el nombre (decisión 37).
const PASSWORD = 'clave-segura-2026';
const BASE = '/api/v1/admin/reports';
const RANGE = 'from=2026-09-01&to=2026-09-03';
const EMPTY_RANGE = 'from=2020-01-01&to=2020-01-03';
const SEP_2 = new Date('2026-09-02T15:00:00.000Z');

describe('HU44 Generar reportes administrativos', () => {
  let app: NestExpressApplication;
  let server: App;
  let prisma: PrismaService;
  let adminToken: string;

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
    const career = await prisma.career.create({ data: { name: 'Carrera' } });
    const signUp = async (handle: string) => {
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

    const admin = await signUp('admin');
    await prisma.user.update({
      where: { id: admin.id },
      data: { role: 'ADMIN' },
    });
    adminToken = admin.token;

    // Actividad y un reporte dentro del rango del informe.
    const ana = await signUp('ana');
    const beto = await signUp('beto');
    await prisma.user.update({
      where: { id: ana.id },
      data: { createdAt: SEP_2 },
    });
    await prisma.post.create({
      data: { authorId: ana.id, content: 'hola', createdAt: SEP_2 },
    });
    await prisma.report.create({
      data: {
        reporterId: beto.id,
        targetType: 'USER',
        targetUserId: ana.id,
        reason: 'SPAM',
        pendingKey: `USER:${ana.id}`,
        createdAt: SEP_2,
      },
    });
  });

  const get = (path: string) =>
    request(server)
      .get(`${BASE}/${path}`)
      .set('Authorization', `Bearer ${adminToken}`);

  it('HU44 E1: genera el reporte de actividad con la información solicitada y permite descargarlo', async () => {
    // Dado que soy administrador y selecciono los parámetros del reporte
    // Cuando confirmo la generación
    const view = await get(`activity?${RANGE}`).expect(200);

    // Entonces el sistema produce el reporte con la información solicitada…
    expect(view.body).toMatchObject({
      kind: 'activity',
      from: '2026-09-01',
      to: '2026-09-03',
      isEmpty: false,
    });
    expect(view.body.rows).toContainEqual(['2026-09-02', 1, 1, 0, 0, 0]);

    // …y permite su descarga.
    const file = await get(`activity/csv?${RANGE}`).expect(200);
    expect(file.headers['content-type']).toContain('text/csv');
    expect(file.headers['content-disposition']).toContain(
      'cafeta-actividad-2026-09-01-2026-09-03.csv',
    );
  });

  it('HU44 E1: genera el reporte de moderación con la información solicitada y permite descargarlo', async () => {
    const view = await get(`moderation?${RANGE}`).expect(200);

    expect(view.body).toMatchObject({ kind: 'moderation', isEmpty: false });
    expect(view.body.rows).toContainEqual(['Spam', 1, 0, 0, 0, 1]);

    const file = await get(`moderation/csv?${RANGE}`).expect(200);
    expect(file.headers['content-disposition']).toContain(
      'cafeta-moderacion-2026-09-01-2026-09-03.csv',
    );
  });

  it('HU44 E2: un rango sin actividad indica que no hay datos disponibles', async () => {
    // Dado que selecciono un rango de fechas sin actividad registrada
    // Cuando genero el reporte
    const activity = await get(`activity?${EMPTY_RANGE}`).expect(200);
    const moderation = await get(`moderation?${EMPTY_RANGE}`).expect(200);

    // Entonces el sistema indica que no hay datos disponibles para dicho rango
    expect(activity.body.isEmpty).toBe(true);
    expect(moderation.body.isEmpty).toBe(true);
  });
});
