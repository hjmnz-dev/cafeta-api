import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import type { ReportReason } from '../src/generated/prisma/client.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { resetDb } from './support/reset-db.js';

// Revisión de reportes de la consola (spec 0009, decisión 33) contra PostgreSQL real.
const PASSWORD = 'clave-segura-2026';
const BASE = '/api/v1/admin/reports';

describe('Revisión de reportes del admin (e2e)', () => {
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
    careerId = (await prisma.career.create({ data: { name: 'Sistemas' } })).id;
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
    return {
      id: res.body.user.id as string,
      token: res.body.accessToken as string,
      email: `${handle}@est.intec.edu.do`,
    };
  };

  const signUpAdmin = async (handle: string) => {
    const admin = await signUp(handle);
    await prisma.user.update({
      where: { id: admin.id },
      data: { role: 'ADMIN' },
    });
    return admin;
  };

  const publish = async (token: string, content: string) =>
    (
      await request(server)
        .post('/api/v1/posts')
        .set('Authorization', `Bearer ${token}`)
        .send({ content })
        .expect(201)
    ).body.id as string;

  // Los reportes los crea la 30 (POST /reports); aquí se insertan como ella.
  const reportUser = (
    reporterId: string,
    targetUserId: string,
    reason: ReportReason = 'SPAM',
    createdAt = new Date(),
  ) =>
    prisma.report.create({
      data: {
        reporterId,
        targetType: 'USER',
        targetUserId,
        reason,
        pendingKey: `USER:${targetUserId}`,
        createdAt,
      },
    });

  const reportPost = (
    reporterId: string,
    postId: string,
    snapshot: string,
    reason: ReportReason = 'SPAM',
    createdAt = new Date(),
  ) =>
    prisma.report.create({
      data: {
        reporterId,
        targetType: 'POST',
        targetPostId: postId,
        targetSnapshot: snapshot,
        reason,
        pendingKey: `POST:${postId}`,
        createdAt,
      },
    });

  const get = (token: string, path = '') =>
    request(server)
      .get(`${BASE}${path}`)
      .set('Authorization', `Bearer ${token}`);

  const resolve = (token: string, id: string, body: object) =>
    request(server)
      .post(`${BASE}/${id}/resolve`)
      .set('Authorization', `Bearer ${token}`)
      .send(body);

  const auditOf = (action: string, entityId: string) =>
    prisma.auditLog.findMany({ where: { action, entityId } });

  describe('GET /admin/reports', () => {
    it('lista los pendientes, el más antiguo primero, con reportante y objetivo', async () => {
      const admin = await signUpAdmin('admin');
      const ana = await signUp('ana');
      const beto = await signUp('beto');
      const carla = await signUp('carla');
      const old = await reportUser(
        ana.id,
        beto.id,
        'HARASSMENT',
        new Date(Date.now() - 60_000),
      );
      const recent = await reportUser(carla.id, beto.id, 'SPAM');

      const res = await get(admin.token).expect(200);

      expect(res.body.items.map((r: { id: string }) => r.id)).toEqual([
        old.id,
        recent.id,
      ]);
      expect(res.body.items[0]).toMatchObject({
        targetType: 'USER',
        reason: 'HARASSMENT',
        status: 'PENDING',
        reporter: { id: ana.id, handle: 'ana' },
        target: { userId: beto.id, handle: 'beto', active: true },
        otherPending: 1,
      });
      expect(res.body.nextCursor).toBeNull();
    });

    it('una publicación trae la copia del reporte, el texto actual y su estado', async () => {
      const admin = await signUpAdmin('admin');
      const ana = await signUp('ana');
      const beto = await signUp('beto');
      const postId = await publish(beto.token, 'Texto original');
      await reportPost(ana.id, postId, 'Texto original');
      await prisma.post.update({
        where: { id: postId },
        data: { content: 'Texto editado', archivedAt: new Date() },
      });

      const res = await get(admin.token).expect(200);

      expect(res.body.items[0].target).toMatchObject({
        postId,
        handle: 'beto',
        snapshot: 'Texto original',
        currentContent: 'Texto editado',
        postState: 'ARCHIVED',
        active: true,
      });
    });

    it('filtra por tipo y por estado; los resueltos van del más reciente', async () => {
      const admin = await signUpAdmin('admin');
      const ana = await signUp('ana');
      const beto = await signUp('beto');
      const carla = await signUp('carla');
      const postId = await publish(beto.token, 'Algo');
      const userReport = await reportUser(ana.id, beto.id);
      const postReport = await reportPost(ana.id, postId, 'Algo');
      const other = await reportUser(ana.id, carla.id);
      await resolve(admin.token, userReport.id, { action: 'DISMISS' }).expect(
        204,
      );
      await resolve(admin.token, other.id, { action: 'DISMISS' }).expect(204);

      const pending = await get(admin.token, '?targetType=POST').expect(200);
      expect(pending.body.items.map((r: { id: string }) => r.id)).toEqual([
        postReport.id,
      ]);
      const done = await get(admin.token, '?status=DISMISSED').expect(200);
      expect(done.body.items.map((r: { id: string }) => r.id)).toEqual([
        other.id,
        userReport.id,
      ]);
      expect(done.body.items[0].resolvedBy.id).toBe(admin.id);
    });

    it('pagina con cursor y rechaza uno que no es de la lista', async () => {
      const admin = await signUpAdmin('admin');
      const ana = await signUp('ana');
      const beto = await signUp('beto');
      const carla = await signUp('carla');
      const r1 = await reportUser(
        ana.id,
        beto.id,
        'SPAM',
        new Date(Date.now() - 3000),
      );
      const r2 = await reportUser(
        ana.id,
        carla.id,
        'SPAM',
        new Date(Date.now() - 2000),
      );
      const r3 = await reportUser(
        beto.id,
        carla.id,
        'SPAM',
        new Date(Date.now() - 1000),
      );

      const first = await get(admin.token, '?limit=2').expect(200);
      expect(first.body.items.map((r: { id: string }) => r.id)).toEqual([
        r1.id,
        r2.id,
      ]);
      const second = await get(
        admin.token,
        `?limit=2&cursor=${first.body.nextCursor}`,
      ).expect(200);
      expect(second.body.items.map((r: { id: string }) => r.id)).toEqual([
        r3.id,
      ]);
      expect(second.body.nextCursor).toBeNull();

      await resolve(admin.token, r1.id, { action: 'DISMISS' }).expect(204);
      const res = await get(admin.token, `?cursor=${r1.id}`).expect(400);
      expect(res.body.code).toBe('INVALID_CURSOR');
    });

    it('un estudiante recibe 403 y queda access.denied; sin sesión 401', async () => {
      const ana = await signUp('ana');

      const res = await get(ana.token).expect(403);

      expect(res.body.code).toBe('FORBIDDEN');
      expect(
        await prisma.auditLog.count({
          where: { action: 'access.denied', actorId: ana.id },
        }),
      ).toBe(1);
      await request(server).get(BASE).expect(401);
    });

    it('rechaza un filtro con un valor que no existe', async () => {
      const admin = await signUpAdmin('admin');
      await get(admin.token, '?status=OPEN').expect(400);
      await get(admin.token, '?targetType=STORY').expect(400);
    });
  });

  describe('GET /admin/reports/:id', () => {
    it('trae el detalle con los otros pendientes sobre el mismo objetivo', async () => {
      const admin = await signUpAdmin('admin');
      const ana = await signUp('ana');
      const beto = await signUp('beto');
      const carla = await signUp('carla');
      const first = await reportUser(ana.id, carla.id, 'SPAM');
      const second = await reportUser(beto.id, carla.id, 'IMPERSONATION');

      const res = await get(admin.token, `/${first.id}`).expect(200);

      expect(res.body.id).toBe(first.id);
      expect(res.body.otherPending).toBe(1);
      expect(res.body.related).toHaveLength(1);
      expect(res.body.related[0]).toMatchObject({
        id: second.id,
        reason: 'IMPERSONATION',
        reporter: { handle: 'beto' },
      });
    });

    it('responde 404 REPORT_NOT_FOUND y 400 para un id mal formado', async () => {
      const admin = await signUpAdmin('admin');

      const res = await get(
        admin.token,
        '/01926f00-0000-7000-8000-0000000000ff',
      ).expect(404);

      expect(res.body.code).toBe('REPORT_NOT_FOUND');
      await get(admin.token, '/no-es-uuid').expect(400);
    });

    it('una publicación borrada después del reporte se ve como DELETED con su copia', async () => {
      const admin = await signUpAdmin('admin');
      const ana = await signUp('ana');
      const beto = await signUp('beto');
      const postId = await publish(beto.token, 'Lo borraré');
      const report = await reportPost(ana.id, postId, 'Lo borraré');
      await request(server)
        .delete(`/api/v1/posts/${postId}`)
        .set('Authorization', `Bearer ${beto.token}`)
        .expect(204);

      const res = await get(admin.token, `/${report.id}`).expect(200);

      expect(res.body.target).toMatchObject({
        postId: null,
        handle: null,
        snapshot: 'Lo borraré',
        postState: 'DELETED',
        active: null,
      });
      expect(res.body.otherPending).toBe(0);
      expect(res.body.related).toEqual([]);
    });
  });

  describe('POST /admin/reports/:id/resolve', () => {
    it('desestimar cierra solo ese reporte, no toca la cuenta y deja la auditoría', async () => {
      const admin = await signUpAdmin('admin');
      const ana = await signUp('ana');
      const beto = await signUp('beto');
      const carla = await signUp('carla');
      const first = await reportUser(ana.id, carla.id);
      const second = await reportUser(beto.id, carla.id);

      await resolve(admin.token, first.id, {
        action: 'DISMISS',
        note: 'No infringe',
      }).expect(204);

      const row = await prisma.report.findUniqueOrThrow({
        where: { id: first.id },
      });
      expect(row).toMatchObject({
        status: 'DISMISSED',
        pendingKey: null,
        resolvedById: admin.id,
        resolutionNote: 'No infringe',
      });
      expect(row.resolvedAt).not.toBeNull();
      expect(
        (await prisma.report.findUniqueOrThrow({ where: { id: second.id } }))
          .status,
      ).toBe('PENDING');
      expect(
        (await prisma.user.findUniqueOrThrow({ where: { id: carla.id } }))
          .deactivatedAt,
      ).toBeNull();
      expect(await auditOf('report.dismiss', first.id)).toHaveLength(1);
      const queue = await get(admin.token).expect(200);
      expect(queue.body.items.map((r: { id: string }) => r.id)).toEqual([
        second.id,
      ]);
    });

    it('desestimar no pide nota y deja resolutionNote vacío', async () => {
      const admin = await signUpAdmin('admin');
      const ana = await signUp('ana');
      const beto = await signUp('beto');
      const report = await reportUser(ana.id, beto.id);

      await resolve(admin.token, report.id, { action: 'DISMISS' }).expect(204);

      expect(
        (await prisma.report.findUniqueOrThrow({ where: { id: report.id } }))
          .resolutionNote,
      ).toBeNull();
    });

    it('sancionar a un usuario lo desactiva, cierra sus sesiones y cierra todos los pendientes sobre él', async () => {
      const admin = await signUpAdmin('admin');
      const ana = await signUp('ana');
      const beto = await signUp('beto');
      const carla = await signUp('carla');
      const first = await reportUser(ana.id, carla.id);
      const second = await reportUser(beto.id, carla.id);
      const unrelated = await reportUser(ana.id, beto.id);

      await resolve(admin.token, first.id, {
        action: 'DEACTIVATE_TARGET',
        note: 'Acoso reiterado',
      }).expect(204);

      expect(
        (await prisma.user.findUniqueOrThrow({ where: { id: carla.id } }))
          .deactivatedAt,
      ).not.toBeNull();
      await request(server)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${carla.token}`)
        .expect(401);
      for (const id of [first.id, second.id]) {
        const row = await prisma.report.findUniqueOrThrow({ where: { id } });
        expect(row).toMatchObject({
          status: 'SANCTIONED',
          pendingKey: null,
          resolvedById: admin.id,
          resolutionNote: 'Acoso reiterado',
        });
        expect(await auditOf('report.sanction', id)).toHaveLength(1);
      }
      expect(
        (await prisma.report.findUniqueOrThrow({ where: { id: unrelated.id } }))
          .status,
      ).toBe('PENDING');
      const [entry] = await auditOf('account.deactivate', carla.id);
      expect(entry).toMatchObject({
        actorId: admin.id,
        metadata: { by: 'admin', reason: 'Acoso reiterado' },
      });
    });

    it('sancionar una publicación la desactiva (el autor sigue activo) y cierra los demás', async () => {
      const admin = await signUpAdmin('admin');
      const ana = await signUp('ana');
      const beto = await signUp('beto');
      const carla = await signUp('carla');
      const postId = await publish(carla.token, 'Spam spam');
      const first = await reportPost(ana.id, postId, 'Spam spam');
      const second = await reportPost(beto.id, postId, 'Spam spam');

      await resolve(admin.token, second.id, {
        action: 'DEACTIVATE_TARGET',
        note: 'Es spam',
      }).expect(204);

      expect(
        (await prisma.post.findUniqueOrThrow({ where: { id: postId } }))
          .deactivatedAt,
      ).not.toBeNull();
      expect(
        (await prisma.user.findUniqueOrThrow({ where: { id: carla.id } }))
          .deactivatedAt,
      ).toBeNull();
      for (const id of [first.id, second.id]) {
        expect(
          (await prisma.report.findUniqueOrThrow({ where: { id } })).status,
        ).toBe('SANCTIONED');
      }
      const [entry] = await auditOf('post.deactivate', postId);
      expect(entry).toMatchObject({
        actorId: admin.id,
        metadata: { by: 'admin', reason: 'Es spam', reportId: second.id },
      });
      const feed = await request(server)
        .get('/api/v1/posts/feed')
        .set('Authorization', `Bearer ${ana.token}`)
        .expect(200);
      expect(feed.body.items).toHaveLength(0);
      const detail = await get(admin.token, `/${first.id}`).expect(200);
      expect(detail.body.target.postState).toBe('DEACTIVATED');
    });

    it('sancionar exige nota de 3 a 500 caracteres y no cambia nada si falta', async () => {
      const admin = await signUpAdmin('admin');
      const ana = await signUp('ana');
      const beto = await signUp('beto');
      const report = await reportUser(ana.id, beto.id);

      for (const body of [
        { action: 'DEACTIVATE_TARGET' },
        { action: 'DEACTIVATE_TARGET', note: 'ab' },
        { action: 'DEACTIVATE_TARGET', note: '   ' },
      ]) {
        const res = await resolve(admin.token, report.id, body).expect(400);
        expect(res.body.code).toBe('NOTE_REQUIRED');
      }
      await resolve(admin.token, report.id, {
        action: 'DEACTIVATE_TARGET',
        note: 'x'.repeat(501),
      }).expect(400);
      expect(
        (await prisma.report.findUniqueOrThrow({ where: { id: report.id } }))
          .status,
      ).toBe('PENDING');
      expect(
        (await prisma.user.findUniqueOrThrow({ where: { id: beto.id } }))
          .deactivatedAt,
      ).toBeNull();
    });

    it('una acción que no existe responde 400', async () => {
      const admin = await signUpAdmin('admin');
      const ana = await signUp('ana');
      const beto = await signUp('beto');
      const report = await reportUser(ana.id, beto.id);

      await resolve(admin.token, report.id, { action: 'BAN' }).expect(400);
      await resolve(admin.token, report.id, {}).expect(400);
    });

    it('uno ya resuelto responde 409 REPORT_ALREADY_RESOLVED y no duplica la bitácora', async () => {
      const admin = await signUpAdmin('admin');
      const ana = await signUp('ana');
      const beto = await signUp('beto');
      const report = await reportUser(ana.id, beto.id);
      await resolve(admin.token, report.id, { action: 'DISMISS' }).expect(204);

      const res = await resolve(admin.token, report.id, {
        action: 'DEACTIVATE_TARGET',
        note: 'Tarde',
      }).expect(409);

      expect(res.body.code).toBe('REPORT_ALREADY_RESOLVED');
      expect(
        (await prisma.user.findUniqueOrThrow({ where: { id: beto.id } }))
          .deactivatedAt,
      ).toBeNull();
      expect(await auditOf('report.dismiss', report.id)).toHaveLength(1);
    });

    it('un reporte que no existe responde 404 REPORT_NOT_FOUND', async () => {
      const admin = await signUpAdmin('admin');

      const res = await resolve(
        admin.token,
        '01926f00-0000-7000-8000-0000000000ff',
        { action: 'DISMISS' },
      ).expect(404);

      expect(res.body.code).toBe('REPORT_NOT_FOUND');
    });

    it('no se sanciona a un admin ni a uno mismo, y el reporte sigue pendiente', async () => {
      const admin = await signUpAdmin('admin');
      const other = await signUpAdmin('otro');
      const ana = await signUp('ana');
      const onOther = await reportUser(ana.id, other.id);
      const onSelf = await reportUser(ana.id, admin.id);
      const adminPostId = await publish(other.token, 'Post de un admin');
      const onPost = await reportPost(ana.id, adminPostId, 'Post de un admin');

      const peer = await resolve(admin.token, onOther.id, {
        action: 'DEACTIVATE_TARGET',
        note: 'Probando',
      }).expect(403);
      expect(peer.body.code).toBe('CANNOT_SANCTION_ADMIN');
      const self = await resolve(admin.token, onSelf.id, {
        action: 'DEACTIVATE_TARGET',
        note: 'Probando',
      }).expect(403);
      expect(self.body.code).toBe('CANNOT_ACT_ON_SELF');
      const post = await resolve(admin.token, onPost.id, {
        action: 'DEACTIVATE_TARGET',
        note: 'Probando',
      }).expect(403);
      expect(post.body.code).toBe('CANNOT_SANCTION_ADMIN');
      expect(await prisma.report.count({ where: { status: 'PENDING' } })).toBe(
        3,
      );
    });

    it('si el usuario ya estaba inactivo, igual cierra el reporte como sancionado sin repetir la baja', async () => {
      const admin = await signUpAdmin('admin');
      const ana = await signUp('ana');
      const beto = await signUp('beto');
      const report = await reportUser(ana.id, beto.id);
      await prisma.user.update({
        where: { id: beto.id },
        data: { deactivatedAt: new Date() },
      });

      await resolve(admin.token, report.id, {
        action: 'DEACTIVATE_TARGET',
        note: 'Ya estaba',
      }).expect(204);

      expect(
        (await prisma.report.findUniqueOrThrow({ where: { id: report.id } }))
          .status,
      ).toBe('SANCTIONED');
      expect(await auditOf('account.deactivate', beto.id)).toHaveLength(0);
    });

    it('si la publicación fue borrada, igual cierra el reporte como sancionado y no toca otros reportes', async () => {
      const admin = await signUpAdmin('admin');
      const ana = await signUp('ana');
      const beto = await signUp('beto');
      const carla = await signUp('carla');
      const postId = await publish(beto.token, 'Lo borraré');
      const report = await reportPost(ana.id, postId, 'Lo borraré');
      const unrelated = await reportUser(ana.id, carla.id);
      await request(server)
        .delete(`/api/v1/posts/${postId}`)
        .set('Authorization', `Bearer ${beto.token}`)
        .expect(204);

      await resolve(admin.token, report.id, {
        action: 'DEACTIVATE_TARGET',
        note: 'Ya no existe',
      }).expect(204);

      expect(
        (await prisma.report.findUniqueOrThrow({ where: { id: report.id } }))
          .status,
      ).toBe('SANCTIONED');
      // Sin objetivo no hay hermanos: los reportes de otros objetivos siguen.
      expect(
        (await prisma.report.findUniqueOrThrow({ where: { id: unrelated.id } }))
          .status,
      ).toBe('PENDING');
      expect(
        (await prisma.user.findUniqueOrThrow({ where: { id: beto.id } }))
          .deactivatedAt,
      ).toBeNull();
    });

    it('tras resolver se puede volver a reportar lo mismo (pendingKey libre)', async () => {
      const admin = await signUpAdmin('admin');
      const ana = await signUp('ana');
      const beto = await signUp('beto');
      const report = await reportUser(ana.id, beto.id);
      await resolve(admin.token, report.id, { action: 'DISMISS' }).expect(204);

      const again = await reportUser(ana.id, beto.id, 'HARASSMENT');

      expect(again.status).toBe('PENDING');
    });

    it('un estudiante recibe 403 y no cambia nada', async () => {
      const ana = await signUp('ana');
      const beto = await signUp('beto');
      const report = await reportUser(ana.id, beto.id);

      await resolve(ana.token, report.id, { action: 'DISMISS' }).expect(403);

      expect(
        (await prisma.report.findUniqueOrThrow({ where: { id: report.id } }))
          .status,
      ).toBe('PENDING');
    });
  });
});
