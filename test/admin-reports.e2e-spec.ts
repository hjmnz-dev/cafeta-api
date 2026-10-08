import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { resetDb } from './support/reset-db.js';

// Informes administrativos (spec 0008, decisión 35) contra PostgreSQL real.
// HU44 E1: generar con datos reales y descargar. HU44 E2: rango sin datos.
const PASSWORD = 'clave-segura-2026';
const BASE = '/api/v1/admin/reports';
const RANGE = 'from=2026-09-01&to=2026-09-03';

// Santo Domingo es UTC-4: el 1 de septiembre local va de 04:00Z a 03:59Z del 2.
const SEP_1_LOCAL = new Date('2026-09-01T15:00:00.000Z');
const SEP_1_LATE_NIGHT = new Date('2026-09-02T03:30:00.000Z'); // 23:30 local del 1
const SEP_2_MIDNIGHT = new Date('2026-09-02T04:00:00.000Z'); // 00:00 local del 2
const AUG_31_LATE_NIGHT = new Date('2026-09-01T03:59:00.000Z'); // 23:59 local del 31 ago
const OUT_OF_RANGE = new Date('2026-09-04T04:00:00.000Z');

describe('Informes administrativos (e2e)', () => {
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

  const signUpAdmin = async () => {
    const admin = await signUp('admin');
    await prisma.user.update({
      where: { id: admin.id },
      data: { role: 'ADMIN' },
    });
    return admin;
  };

  const get = (token: string, path: string) =>
    request(server)
      .get(`${BASE}/${path}`)
      .set('Authorization', `Bearer ${token}`);

  // Los registros de prueba nacen "hoy"; los movemos al rango del informe.
  const setCreatedAt = (id: string, createdAt: Date) =>
    prisma.user.update({ where: { id }, data: { createdAt } });

  const seedActivity = async () => {
    const ana = await signUp('ana');
    const beto = await signUp('beto');
    await setCreatedAt(ana.id, SEP_1_LOCAL);
    await setCreatedAt(beto.id, OUT_OF_RANGE);

    const post = (createdAt: Date, extra: object = {}) =>
      prisma.post.create({
        data: { authorId: ana.id, content: 'hola', createdAt, ...extra },
      });
    const p1 = await post(SEP_1_LATE_NIGHT);
    await post(SEP_2_MIDNIGHT);
    await post(AUG_31_LATE_NIGHT);
    // Desactivada después: sigue contando, porque el informe mide actividad.
    await post(SEP_1_LOCAL, { deactivatedAt: new Date() });

    await prisma.story.create({
      data: {
        authorId: ana.id,
        text: 'hi',
        expiresAt: new Date('2026-09-02T15:00:00.000Z'),
        createdAt: SEP_1_LOCAL,
      },
    });
    await prisma.postComment.create({
      data: {
        postId: p1.id,
        authorId: beto.id,
        content: 'c',
        createdAt: SEP_2_MIDNIGHT,
      },
    });

    const [userAId, userBId] = [ana.id, beto.id].sort();
    const conversation = await prisma.conversation.create({
      data: { userAId, userBId },
    });
    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        senderId: ana.id,
        content: 'm',
        createdAt: SEP_2_MIDNIGHT,
      },
    });
  };

  it('AC-1: el informe de actividad cuenta por día en hora de Santo Domingo', async () => {
    const admin = await signUpAdmin();
    await seedActivity();

    const res = await get(admin.token, `activity?${RANGE}`).expect(200);

    expect(res.body).toMatchObject({
      kind: 'activity',
      from: '2026-09-01',
      to: '2026-09-03',
      isEmpty: false,
      columns: [
        'Fecha',
        'Usuarios nuevos',
        'Publicaciones',
        'Historias',
        'Comentarios',
        'Mensajes',
      ],
    });
    // 23:30 local del 1 sigue siendo el 1; 00:00 local del 2 ya es el 2; el
    // 23:59 del 31 de agosto queda fuera.
    expect(res.body.rows).toEqual([
      ['2026-09-01', 1, 2, 1, 0, 0],
      ['2026-09-02', 0, 1, 0, 1, 1],
      ['2026-09-03', 0, 0, 0, 0, 0],
    ]);
  });

  it('AC-2: el informe de moderación cuenta por motivo y estado', async () => {
    const admin = await signUpAdmin();
    const ana = await signUp('ana');
    const beto = await signUp('beto');
    const report = (
      reporterId: string,
      targetUserId: string,
      reason: 'SPAM' | 'HARASSMENT',
      status: 'PENDING' | 'SANCTIONED' | 'DISMISSED',
      createdAt: Date,
      resolvedAt?: Date,
    ) =>
      prisma.report.create({
        data: {
          reporterId,
          targetType: 'USER',
          targetUserId,
          reason,
          status,
          // La base exige pending_key solo mientras el reporte está pendiente.
          ...(status === 'PENDING'
            ? { pendingKey: `USER:${targetUserId}` }
            : {}),
          createdAt,
          ...(resolvedAt ? { resolvedAt, resolvedById: admin.id } : {}),
        },
      });
    await report(ana.id, beto.id, 'SPAM', 'PENDING', SEP_1_LOCAL);
    await report(
      beto.id,
      ana.id,
      'SPAM',
      'SANCTIONED',
      SEP_1_LOCAL,
      SEP_2_MIDNIGHT,
    );
    await report(
      beto.id,
      ana.id,
      'HARASSMENT',
      'DISMISSED',
      SEP_1_LOCAL,
      SEP_2_MIDNIGHT,
    );
    // Creado antes del rango y resuelto dentro: cuenta como sanción, no como creado.
    await report(
      ana.id,
      beto.id,
      'HARASSMENT',
      'SANCTIONED',
      new Date('2026-08-01T15:00:00.000Z'),
      SEP_2_MIDNIGHT,
    );

    const res = await get(admin.token, `moderation?${RANGE}`).expect(200);

    expect(res.body.columns).toEqual([
      'Motivo',
      'Creados',
      'Resueltos',
      'Sancionados',
      'Descartados',
      'Pendientes',
    ]);
    expect(res.body.isEmpty).toBe(false);
    expect(res.body.rows).toEqual([
      ['Spam', 2, 1, 1, 0, 1],
      ['Acoso', 1, 2, 1, 1, 0],
      ['Contenido inapropiado', 0, 0, 0, 0, 0],
      ['Suplantación de identidad', 0, 0, 0, 0, 0],
      ['Otro', 0, 0, 0, 0, 0],
      ['Total', 3, 3, 2, 1, 1],
    ]);
  });

  it('AC-3: la descarga es un CSV UTF-8 con BOM y nombre con el rango', async () => {
    const admin = await signUpAdmin();
    await seedActivity();

    const res = await get(admin.token, `activity/csv?${RANGE}`)
      .buffer(true)
      .parse((r, done) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(c));
        r.on('end', () => done(null, Buffer.concat(chunks)));
      })
      .expect(200);

    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain(
      'cafeta-actividad-2026-09-01-2026-09-03.csv',
    );
    const body = res.body as Buffer;
    expect([...body.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(body.toString('utf-8')).toBe(
      '﻿Fecha,Usuarios nuevos,Publicaciones,Historias,Comentarios,Mensajes\r\n' +
        '2026-09-01,1,2,1,0,0\r\n' +
        '2026-09-02,0,1,0,1,1\r\n' +
        '2026-09-03,0,0,0,0,0\r\n',
    );
  });

  it('AC-4: un rango sin actividad responde isEmpty para avisar que no hay datos', async () => {
    const admin = await signUpAdmin();

    const activity = await get(admin.token, `activity?${RANGE}`).expect(200);
    expect(activity.body.isEmpty).toBe(true);
    expect(activity.body.rows).toHaveLength(3);

    const moderation = await get(admin.token, `moderation?${RANGE}`).expect(
      200,
    );
    expect(moderation.body.isEmpty).toBe(true);
  });

  it('AC-5: valida el rango con códigos estables', async () => {
    const admin = await signUpAdmin();
    const code = async (query: string) =>
      (await get(admin.token, `activity?${query}`).expect(400)).body.code;

    expect(await code('from=2026-09-05&to=2026-09-01')).toBe(
      'INVALID_DATE_RANGE',
    );
    expect(await code('from=2026-02-31&to=2026-03-05')).toBe(
      'INVALID_DATE_RANGE',
    );
    expect(await code('from=2026-07-01&to=2026-10-01')).toBe('RANGE_TOO_LARGE');
    expect(await code('from=ayer&to=hoy')).toBe('VALIDATION_ERROR');
    expect(await code('from=2026-09-01')).toBe('VALIDATION_ERROR');
    expect(
      (await get(admin.token, `otro?${RANGE}`).expect(400)).body.code,
    ).toBe('VALIDATION_ERROR');
    await get(admin.token, 'activity?from=2026-07-01&to=2026-09-30').expect(
      200,
    );
  });

  it('AC-6: cada generación queda auditada con report.generate', async () => {
    const admin = await signUpAdmin();

    await get(admin.token, `activity?${RANGE}`).expect(200);
    await get(admin.token, `moderation/csv?${RANGE}`).expect(200);
    await get(admin.token, 'activity?from=2026-09-05&to=2026-09-01').expect(
      400,
    );

    const entries = await prisma.auditLog.findMany({
      where: { action: 'report.generate' },
      orderBy: { createdAt: 'asc' },
    });
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({
      actorId: admin.id,
      actorRole: 'ADMIN',
      entityType: 'report',
      succeeded: true,
    });
    expect(entries[0].metadata).toMatchObject({
      kind: 'activity',
      from: '2026-09-01',
      to: '2026-09-03',
      format: 'json',
      rows: 3,
    });
    expect(entries[1].metadata).toMatchObject({
      kind: 'moderation',
      format: 'csv',
    });
  });

  it('AC-7: un estudiante recibe 403 FORBIDDEN y sin sesión 401', async () => {
    const ana = await signUp('ana');

    for (const path of [`activity?${RANGE}`, `moderation/csv?${RANGE}`]) {
      const res = await get(ana.token, path).expect(403);
      expect(res.body.code).toBe('FORBIDDEN');
    }
    await request(server).get(`${BASE}/activity?${RANGE}`).expect(401);
    expect(
      await prisma.auditLog.count({ where: { action: 'report.generate' } }),
    ).toBe(0);
  });
});
