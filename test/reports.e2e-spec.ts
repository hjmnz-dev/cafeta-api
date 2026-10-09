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

describe('Reportar usuarios y publicaciones (e2e)', () => {
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

  const send = (account: Account, body: Record<string, unknown>) =>
    request(server)
      .post('/api/v1/reports')
      .set('Authorization', `Bearer ${account.token}`)
      .set('User-Agent', 'cafeta-e2e')
      .send(body);

  const publish = async (account: Account, content: string) => {
    const res = await request(server)
      .post('/api/v1/posts')
      .set('Authorization', `Bearer ${account.token}`)
      .send({ content })
      .expect(201);
    return res.body.id as string;
  };

  const block = (account: Account, userId: string) =>
    request(server)
      .post(`/api/v1/users/${userId}/block`)
      .set('Authorization', `Bearer ${account.token}`)
      .expect(200);

  describe('HU55: reportar usuario', () => {
    it('E1: guarda el reporte con motivo y autor, pendiente para el admin', async () => {
      const ana = await signUp('ana_rep');
      const beto = await signUp('beto_rep');

      const res = await send(ana, {
        targetType: 'USER',
        targetId: beto.id,
        reason: 'HARASSMENT',
      }).expect(201);

      expect(res.body).toMatchObject({
        targetType: 'USER',
        targetId: beto.id,
        reason: 'HARASSMENT',
        status: 'PENDING',
      });
      const row = await prisma.report.findUniqueOrThrow({
        where: { id: res.body.id },
      });
      expect(row).toMatchObject({
        reporterId: ana.id,
        targetUserId: beto.id,
        targetPostId: null,
        targetSnapshot: null,
        status: 'PENDING',
        pendingKey: `USER:${beto.id}`,
      });
    });

    it('E2: repetirlo responde 409 sin importar el motivo y no crea otra fila', async () => {
      const ana = await signUp('ana_dup');
      const beto = await signUp('beto_dup');
      await send(ana, {
        targetType: 'USER',
        targetId: beto.id,
        reason: 'SPAM',
      }).expect(201);

      const again = await send(ana, {
        targetType: 'USER',
        targetId: beto.id,
        reason: 'HARASSMENT',
      }).expect(409);

      expect(again.body.code).toBe('REPORT_ALREADY_PENDING');
      expect(await prisma.report.count()).toBe(1);
    });

    it('otro estudiante sí puede reportar al mismo usuario', async () => {
      const ana = await signUp('ana_multi');
      const carla = await signUp('carla_multi');
      const beto = await signUp('beto_multi');
      const body = { targetType: 'USER', targetId: beto.id, reason: 'SPAM' };

      await send(ana, body).expect(201);
      await send(carla, body).expect(201);

      expect(await prisma.report.count()).toBe(2);
    });

    it('al resolverse el reporte se puede reportar de nuevo', async () => {
      const ana = await signUp('ana_again');
      const beto = await signUp('beto_again');
      const body = { targetType: 'USER', targetId: beto.id, reason: 'SPAM' };
      const first = await send(ana, body).expect(201);

      await prisma.report.update({
        where: { id: first.body.id },
        data: { status: 'DISMISSED', pendingKey: null },
      });

      await send(ana, body).expect(201);
    });

    it('dos envíos a la vez dejan un solo reporte', async () => {
      const ana = await signUp('ana_race');
      const beto = await signUp('beto_race');
      const body = { targetType: 'USER', targetId: beto.id, reason: 'SPAM' };

      const results = await Promise.all([send(ana, body), send(ana, body)]);

      expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
      expect(await prisma.report.count()).toBe(1);
    });

    it('no se puede reportar a uno mismo (400 CANNOT_REPORT_SELF)', async () => {
      const ana = await signUp('ana_self');

      const res = await send(ana, {
        targetType: 'USER',
        targetId: ana.id,
        reason: 'SPAM',
      }).expect(400);

      expect(res.body.code).toBe('CANNOT_REPORT_SELF');
    });

    it('un usuario que no existe responde 404 USER_NOT_FOUND', async () => {
      const ana = await signUp('ana_ghost');

      const res = await send(ana, {
        targetType: 'USER',
        targetId: '00000000-0000-7000-8000-000000000000',
        reason: 'SPAM',
      }).expect(404);

      expect(res.body.code).toBe('USER_NOT_FOUND');
    });

    it('con un bloqueo en cualquier sentido responde 404 como si no existiera', async () => {
      const ana = await signUp('ana_blk');
      const beto = await signUp('beto_blk');
      await block(beto, ana.id);

      const res = await send(ana, {
        targetType: 'USER',
        targetId: beto.id,
        reason: 'SPAM',
      }).expect(404);

      expect(res.body.code).toBe('USER_NOT_FOUND');
      expect(await prisma.report.count()).toBe(0);
    });

    it('un usuario desactivado responde 404', async () => {
      const ana = await signUp('ana_off');
      const beto = await signUp('beto_off');
      await prisma.user.update({
        where: { id: beto.id },
        data: { deactivatedAt: new Date() },
      });

      await send(ana, {
        targetType: 'USER',
        targetId: beto.id,
        reason: 'SPAM',
      }).expect(404);
    });
  });

  describe('HU56: reportar publicación', () => {
    it('E1: guarda el reporte con la copia del texto de la publicación', async () => {
      const ana = await signUp('ana_post');
      const beto = await signUp('beto_post');
      const postId = await publish(beto, 'Vendo apuntes a precio de oro');

      const res = await send(ana, {
        targetType: 'POST',
        targetId: postId,
        reason: 'SPAM',
      }).expect(201);

      expect(res.body).toMatchObject({
        targetType: 'POST',
        targetId: postId,
        status: 'PENDING',
      });
      const row = await prisma.report.findUniqueOrThrow({
        where: { id: res.body.id },
      });
      expect(row).toMatchObject({
        reporterId: ana.id,
        targetUserId: null,
        targetPostId: postId,
        targetSnapshot: 'Vendo apuntes a precio de oro',
        pendingKey: `POST:${postId}`,
      });
    });

    it('E2: repetirlo responde 409 REPORT_ALREADY_PENDING', async () => {
      const ana = await signUp('ana_pdup');
      const beto = await signUp('beto_pdup');
      const postId = await publish(beto, 'Algo');
      const body = { targetType: 'POST', targetId: postId, reason: 'SPAM' };
      await send(ana, body).expect(201);

      const again = await send(ana, body).expect(409);

      expect(again.body.code).toBe('REPORT_ALREADY_PENDING');
      expect(await prisma.report.count()).toBe(1);
    });

    it('un reporte de usuario y uno de publicación del mismo autor no chocan', async () => {
      const ana = await signUp('ana_both');
      const beto = await signUp('beto_both');
      const postId = await publish(beto, 'Algo');

      await send(ana, {
        targetType: 'USER',
        targetId: beto.id,
        reason: 'SPAM',
      }).expect(201);
      await send(ana, {
        targetType: 'POST',
        targetId: postId,
        reason: 'SPAM',
      }).expect(201);
    });

    it('no se puede reportar una publicación propia', async () => {
      const ana = await signUp('ana_own');
      const postId = await publish(ana, 'Mía');

      const res = await send(ana, {
        targetType: 'POST',
        targetId: postId,
        reason: 'SPAM',
      }).expect(400);

      expect(res.body.code).toBe('CANNOT_REPORT_SELF');
    });

    it('archivada, desactivada o inexistente responde 404 POST_NOT_FOUND', async () => {
      const ana = await signUp('ana_gone');
      const beto = await signUp('beto_gone');
      const archived = await publish(beto, 'Archivada');
      const deactivated = await publish(beto, 'Desactivada');
      await prisma.post.update({
        where: { id: archived },
        data: { archivedAt: new Date() },
      });
      await prisma.post.update({
        where: { id: deactivated },
        data: { deactivatedAt: new Date() },
      });

      for (const id of [
        archived,
        deactivated,
        '00000000-0000-7000-8000-000000000000',
      ]) {
        const res = await send(ana, {
          targetType: 'POST',
          targetId: id,
          reason: 'SPAM',
        }).expect(404);
        expect(res.body.code).toBe('POST_NOT_FOUND');
      }
    });

    it('si el autor la tiene bloqueada para quien reporta, responde 404', async () => {
      const ana = await signUp('ana_pblk');
      const beto = await signUp('beto_pblk');
      const postId = await publish(beto, 'Algo');
      await block(ana, beto.id);

      const res = await send(ana, {
        targetType: 'POST',
        targetId: postId,
        reason: 'SPAM',
      }).expect(404);

      expect(res.body.code).toBe('POST_NOT_FOUND');
    });

    it('si el autor es solo para seguidores, solo lo reporta quien lo sigue', async () => {
      const ana = await signUp('ana_foll');
      const beto = await signUp('beto_foll');
      const postId = await publish(beto, 'Solo para seguidores');
      await prisma.profile.update({
        where: { userId: beto.id },
        data: { visibility: 'FOLLOWERS' },
      });
      const body = { targetType: 'POST', targetId: postId, reason: 'SPAM' };

      await send(ana, body).expect(404);

      await prisma.follow.create({
        data: {
          followerId: ana.id,
          followingId: beto.id,
          status: 'ACCEPTED',
        },
      });
      await send(ana, body).expect(201);
    });
  });

  describe('validación y auditoría', () => {
    it('OTHER sin detalle responde 400 DETAILS_REQUIRED y con detalle se guarda', async () => {
      const ana = await signUp('ana_other');
      const beto = await signUp('beto_other');
      const body = { targetType: 'USER', targetId: beto.id, reason: 'OTHER' };

      const missing = await send(ana, body).expect(400);
      expect(missing.body.code).toBe('DETAILS_REQUIRED');
      await send(ana, { ...body, details: '   ' }).expect(400);

      const ok = await send(ana, {
        ...body,
        details: '  Me escribe a todas horas  ',
      }).expect(201);
      const row = await prisma.report.findUniqueOrThrow({
        where: { id: ok.body.id },
      });
      expect(row.details).toBe('Me escribe a todas horas');
    });

    it('rechaza motivo, tipo o id inválidos y campos de más', async () => {
      const ana = await signUp('ana_bad');
      const beto = await signUp('beto_bad');

      await send(ana, {
        targetType: 'USER',
        targetId: beto.id,
        reason: 'ODIO',
      }).expect(400);
      await send(ana, {
        targetType: 'STORY',
        targetId: beto.id,
        reason: 'SPAM',
      }).expect(400);
      await send(ana, {
        targetType: 'USER',
        targetId: 'no-es-uuid',
        reason: 'SPAM',
      }).expect(400);
      await send(ana, {
        targetType: 'USER',
        targetId: beto.id,
        reason: 'SPAM',
        reporterId: beto.id,
      }).expect(400);
      await send(ana, {
        targetType: 'USER',
        targetId: beto.id,
        reason: 'SPAM',
        details: 'x'.repeat(501),
      }).expect(400);
      expect(await prisma.report.count()).toBe(0);
    });

    it('sin sesión responde 401', async () => {
      await request(server)
        .post('/api/v1/reports')
        .send({
          targetType: 'USER',
          targetId: '00000000-0000-7000-8000-000000000000',
          reason: 'SPAM',
        })
        .expect(401);
    });

    it('deja la auditoría report.create con el reportante y el objetivo', async () => {
      const ana = await signUp('ana_audit');
      const beto = await signUp('beto_audit');
      const res = await send(ana, {
        targetType: 'USER',
        targetId: beto.id,
        reason: 'IMPERSONATION',
      }).expect(201);

      const log = await prisma.auditLog.findFirstOrThrow({
        where: { action: 'report.create' },
      });
      expect(log).toMatchObject({
        entityType: 'report',
        entityId: res.body.id,
        actorId: ana.id,
        succeeded: true,
        metadata: {
          targetType: 'USER',
          targetId: beto.id,
          reason: 'IMPERSONATION',
        },
      });
    });

    it('no avisa al reportado: no crea ninguna notificación', async () => {
      const ana = await signUp('ana_quiet');
      const beto = await signUp('beto_quiet');
      const before = await prisma.notification.count();

      await send(ana, {
        targetType: 'USER',
        targetId: beto.id,
        reason: 'SPAM',
      }).expect(201);

      expect(await prisma.notification.count()).toBe(before);
    });
  });
});
