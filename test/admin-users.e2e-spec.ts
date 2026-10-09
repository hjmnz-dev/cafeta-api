import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { resetDb } from './support/reset-db.js';

// Gestión de usuarios de la consola (spec 0009, decisión 32) contra PostgreSQL real.
const PASSWORD = 'clave-segura-2026';
const BASE = '/api/v1/admin/users';

describe('Gestión de usuarios del admin (e2e)', () => {
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

  const login = (email: string) =>
    request(server)
      .post('/api/v1/auth/login')
      .send({ email, password: PASSWORD });

  const list = (token: string, query = '') =>
    request(server)
      .get(`${BASE}${query}`)
      .set('Authorization', `Bearer ${token}`);

  const post = (token: string, path: string, body: object) =>
    request(server)
      .post(`${BASE}/${path}`)
      .set('Authorization', `Bearer ${token}`)
      .send(body);

  const auditOf = (action: string, entityId: string) =>
    prisma.auditLog.findMany({ where: { action, entityId } });

  describe('GET /admin/users', () => {
    it('lista los usuarios con sus datos, del más nuevo al más antiguo', async () => {
      const admin = await signUpAdmin('admin');
      const ana = await signUp('ana');
      const beto = await signUp('beto');

      const res = await list(admin.token).expect(200);

      expect(res.body.items.map((u: { id: string }) => u.id)).toEqual([
        beto.id,
        ana.id,
        admin.id,
      ]);
      expect(res.body.items[1]).toMatchObject({
        id: ana.id,
        email: ana.email,
        handle: 'ana',
        displayName: 'ana Prueba',
        career: 'Sistemas',
        role: 'STUDENT',
        active: true,
        deactivatedAt: null,
        verificationStatus: 'PENDING',
      });
      expect(res.body.nextCursor).toBeNull();
    });

    it('busca por correo, usuario o nombre sin importar mayúsculas', async () => {
      const admin = await signUpAdmin('admin');
      const ana = await signUp('anaperez');
      await signUp('beto');

      const byHandle = await list(admin.token, '?search=ANAPE').expect(200);
      expect(byHandle.body.items.map((u: { id: string }) => u.id)).toEqual([
        ana.id,
      ]);
      const byEmail = await list(admin.token, '?search=Beto@EST').expect(200);
      expect(byEmail.body.items).toHaveLength(1);
      const byName = await list(admin.token, '?search=prueba').expect(200);
      expect(byName.body.items).toHaveLength(3);
      const none = await list(admin.token, '?search=zzzz').expect(200);
      expect(none.body.items).toEqual([]);
    });

    it('filtra por estado, verificación y rol', async () => {
      const admin = await signUpAdmin('admin');
      const ana = await signUp('ana');
      const beto = await signUp('beto');
      await prisma.user.update({
        where: { id: ana.id },
        data: { deactivatedAt: new Date() },
      });
      await prisma.user.update({
        where: { id: beto.id },
        data: { verificationStatus: 'VERIFIED' },
      });
      const ids = (body: { items: { id: string }[] }) =>
        body.items.map((u) => u.id);

      expect(
        ids((await list(admin.token, '?status=inactive').expect(200)).body),
      ).toEqual([ana.id]);
      expect(
        ids((await list(admin.token, '?status=active').expect(200)).body),
      ).toEqual([beto.id, admin.id]);
      expect(
        ids(
          (await list(admin.token, '?verification=VERIFIED').expect(200)).body,
        ),
      ).toEqual([beto.id]);
      expect(
        ids((await list(admin.token, '?role=ADMIN').expect(200)).body),
      ).toEqual([admin.id]);
      expect(
        ids(
          (
            await list(
              admin.token,
              '?status=active&verification=PENDING',
            ).expect(200)
          ).body,
        ),
      ).toEqual([admin.id]);
    });

    it('rechaza un filtro con un valor que no existe', async () => {
      const admin = await signUpAdmin('admin');
      await list(admin.token, '?status=banned').expect(400);
      await list(admin.token, '?role=OWNER').expect(400);
    });

    it('pagina con cursor y rechaza uno que no es de la lista filtrada', async () => {
      const admin = await signUpAdmin('admin');
      const ana = await signUp('ana');
      const beto = await signUp('beto');

      const first = await list(admin.token, '?limit=2').expect(200);
      expect(first.body.items.map((u: { id: string }) => u.id)).toEqual([
        beto.id,
        ana.id,
      ]);
      expect(first.body.nextCursor).toBe(ana.id);
      const second = await list(
        admin.token,
        `?limit=2&cursor=${first.body.nextCursor}`,
      ).expect(200);
      expect(second.body.items.map((u: { id: string }) => u.id)).toEqual([
        admin.id,
      ]);
      expect(second.body.nextCursor).toBeNull();

      const res = await list(
        admin.token,
        `?role=ADMIN&cursor=${ana.id}`,
      ).expect(400);
      expect(res.body.code).toBe('INVALID_CURSOR');
    });

    it('un estudiante recibe 403 y queda access.denied en la bitácora', async () => {
      const ana = await signUp('ana');

      const res = await list(ana.token).expect(403);

      expect(res.body.code).toBe('FORBIDDEN');
      const denied = await prisma.auditLog.findMany({
        where: { action: 'access.denied', actorId: ana.id },
      });
      expect(denied).toHaveLength(1);
    });

    it('sin sesión responde 401', async () => {
      await request(server).get(BASE).expect(401);
    });
  });

  describe('POST /admin/users/:id/deactivate', () => {
    it('desactiva: cierra sus sesiones, impide el login y deja el motivo en la bitácora', async () => {
      const admin = await signUpAdmin('admin');
      const ana = await signUp('ana');

      await post(admin.token, `${ana.id}/deactivate`, {
        reason: 'Acoso reiterado',
      }).expect(204);

      await request(server)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${ana.token}`)
        .expect(401);
      const denied = await login(ana.email).expect(403);
      expect(denied.body.code).toBe('ACCOUNT_INACTIVE');
      const [entry] = await auditOf('account.deactivate', ana.id);
      expect(entry).toMatchObject({
        actorId: admin.id,
        actorRole: 'ADMIN',
        metadata: { by: 'admin', reason: 'Acoso reiterado' },
      });
      const row = await list(admin.token, '?status=inactive').expect(200);
      expect(row.body.items[0]).toMatchObject({
        id: ana.id,
        active: false,
      });
    });

    it('oculta a la persona: su perfil responde 404 para los demás', async () => {
      const admin = await signUpAdmin('admin');
      const ana = await signUp('ana');
      const beto = await signUp('beto');

      await post(admin.token, `${ana.id}/deactivate`, {
        reason: 'Suplantación',
      }).expect(204);

      await request(server)
        .get(`/api/v1/users/${ana.id}/profile`)
        .set('Authorization', `Bearer ${beto.token}`)
        .expect(404);
    });

    it('si ya estaba desactivada responde 409 ALREADY_INACTIVE y no repite la bitácora', async () => {
      const admin = await signUpAdmin('admin');
      const ana = await signUp('ana');
      await post(admin.token, `${ana.id}/deactivate`, {
        reason: 'Primera',
      }).expect(204);

      const res = await post(admin.token, `${ana.id}/deactivate`, {
        reason: 'Otra vez',
      }).expect(409);

      expect(res.body.code).toBe('ALREADY_INACTIVE');
      expect(await auditOf('account.deactivate', ana.id)).toHaveLength(1);
    });

    it('exige un motivo de 3 a 500 caracteres', async () => {
      const admin = await signUpAdmin('admin');
      const ana = await signUp('ana');

      await post(admin.token, `${ana.id}/deactivate`, {}).expect(400);
      await post(admin.token, `${ana.id}/deactivate`, { reason: 'ab' }).expect(
        400,
      );
      await post(admin.token, `${ana.id}/deactivate`, {
        reason: 'x'.repeat(501),
      }).expect(400);
      expect(
        (await prisma.user.findUniqueOrThrow({ where: { id: ana.id } }))
          .deactivatedAt,
      ).toBeNull();
    });

    it('un admin no se desactiva a sí mismo ni a otro admin', async () => {
      const admin = await signUpAdmin('admin');
      const otro = await signUpAdmin('otro');

      const self = await post(admin.token, `${admin.id}/deactivate`, {
        reason: 'Probando',
      }).expect(403);
      expect(self.body.code).toBe('CANNOT_ACT_ON_SELF');
      const peer = await post(admin.token, `${otro.id}/deactivate`, {
        reason: 'Probando',
      }).expect(403);
      expect(peer.body.code).toBe('CANNOT_SANCTION_ADMIN');
      expect(
        await prisma.user.count({ where: { deactivatedAt: { not: null } } }),
      ).toBe(0);
    });

    it('responde 404 USER_NOT_FOUND para un id que no existe y 400 para uno mal formado', async () => {
      const admin = await signUpAdmin('admin');

      const res = await post(
        admin.token,
        '01926f00-0000-7000-8000-0000000000ff/deactivate',
        { reason: 'Probando' },
      ).expect(404);
      expect(res.body.code).toBe('USER_NOT_FOUND');
      await post(admin.token, 'no-es-uuid/deactivate', {
        reason: 'Probando',
      }).expect(400);
    });

    it('un estudiante recibe 403 y no cambia nada', async () => {
      const ana = await signUp('ana');
      const beto = await signUp('beto');

      await post(ana.token, `${beto.id}/deactivate`, {
        reason: 'Probando',
      }).expect(403);

      expect(
        (await prisma.user.findUniqueOrThrow({ where: { id: beto.id } }))
          .deactivatedAt,
      ).toBeNull();
    });
  });

  describe('POST /admin/users/:id/reactivate', () => {
    it('reactiva con su historial; las sesiones viejas siguen cerradas y entra con una nueva', async () => {
      const admin = await signUpAdmin('admin');
      const ana = await signUp('ana');
      const beto = await signUp('beto');
      await request(server)
        .post('/api/v1/posts')
        .set('Authorization', `Bearer ${ana.token}`)
        .send({ content: 'Mi primera publicación' })
        .expect(201);
      await post(admin.token, `${ana.id}/deactivate`, {
        reason: 'Revisión',
      }).expect(204);

      await post(admin.token, `${ana.id}/reactivate`, {
        reason: 'Todo en orden',
      }).expect(204);

      await request(server)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${ana.token}`)
        .expect(401);
      const fresh = await login(ana.email).expect(200);
      expect(fresh.body.user.id).toBe(ana.id);
      const feed = await request(server)
        .get(`/api/v1/users/${ana.id}/posts`)
        .set('Authorization', `Bearer ${beto.token}`)
        .expect(200);
      expect(feed.body.items).toHaveLength(1);
      const [entry] = await auditOf('account.reactivate', ana.id);
      expect(entry).toMatchObject({
        actorId: admin.id,
        metadata: { by: 'admin', reason: 'Todo en orden' },
      });
    });

    it('si ya estaba activa responde 409 ALREADY_ACTIVE (HU49 E2)', async () => {
      const admin = await signUpAdmin('admin');
      const ana = await signUp('ana');

      const res = await post(admin.token, `${ana.id}/reactivate`, {
        reason: 'Por si acaso',
      }).expect(409);

      expect(res.body.code).toBe('ALREADY_ACTIVE');
      expect(await auditOf('account.reactivate', ana.id)).toHaveLength(0);
    });

    it('un admin no puede reactivarse a sí mismo', async () => {
      const admin = await signUpAdmin('admin');

      const res = await post(admin.token, `${admin.id}/reactivate`, {
        reason: 'Probando',
      }).expect(403);

      expect(res.body.code).toBe('CANNOT_ACT_ON_SELF');
    });
  });

  describe('POST /admin/users/:id/verification', () => {
    const notificationsOf = (userId: string) =>
      prisma.notification.findMany({
        where: { recipientId: userId, type: 'VERIFICATION_RESULT' },
      });

    it('verifica: queda VERIFIED con fecha, se audita y se avisa a la persona', async () => {
      const admin = await signUpAdmin('admin');
      const ana = await signUp('ana');

      await post(admin.token, `${ana.id}/verification`, {
        decision: 'VERIFIED',
      }).expect(204);

      const row = await prisma.user.findUniqueOrThrow({
        where: { id: ana.id },
      });
      expect(row.verificationStatus).toBe('VERIFIED');
      expect(row.verifiedAt).not.toBeNull();
      const [entry] = await auditOf('account.verify', ana.id);
      expect(entry).toMatchObject({ actorId: admin.id });
      const notices = await notificationsOf(ana.id);
      expect(notices).toHaveLength(1);
      expect(notices[0]?.actorId).toBeNull();
    });

    it('la insignia aparece en el perfil de la persona verificada', async () => {
      const admin = await signUpAdmin('admin');
      const ana = await signUp('ana');
      const beto = await signUp('beto');
      await post(admin.token, `${ana.id}/verification`, {
        decision: 'VERIFIED',
      }).expect(204);

      const res = await request(server)
        .get(`/api/v1/users/${ana.id}/profile`)
        .set('Authorization', `Bearer ${beto.token}`)
        .expect(200);

      expect(res.body.verified).toBe(true);
    });

    it('rechaza: queda REJECTED, se audita account.reject_verification y se avisa', async () => {
      const admin = await signUpAdmin('admin');
      const ana = await signUp('ana');

      await post(admin.token, `${ana.id}/verification`, {
        decision: 'REJECTED',
      }).expect(204);

      const row = await prisma.user.findUniqueOrThrow({
        where: { id: ana.id },
      });
      expect(row.verificationStatus).toBe('REJECTED');
      expect(row.verifiedAt).toBeNull();
      expect(await auditOf('account.reject_verification', ana.id)).toHaveLength(
        1,
      );
      expect(await notificationsOf(ana.id)).toHaveLength(1);
    });

    it('una cuenta con decisión no se puede decidir otra vez: 409 sin segundo aviso', async () => {
      const admin = await signUpAdmin('admin');
      const ana = await signUp('ana');
      await post(admin.token, `${ana.id}/verification`, {
        decision: 'VERIFIED',
      }).expect(204);

      const res = await post(admin.token, `${ana.id}/verification`, {
        decision: 'REJECTED',
      }).expect(409);

      expect(res.body.code).toBe('VERIFICATION_ALREADY_DECIDED');
      expect(
        (await prisma.user.findUniqueOrThrow({ where: { id: ana.id } }))
          .verificationStatus,
      ).toBe('VERIFIED');
      expect(await notificationsOf(ana.id)).toHaveLength(1);
      expect(await auditOf('account.reject_verification', ana.id)).toHaveLength(
        0,
      );
    });

    it('rechaza una decisión que no es VERIFIED ni REJECTED', async () => {
      const admin = await signUpAdmin('admin');
      const ana = await signUp('ana');

      await post(admin.token, `${ana.id}/verification`, {
        decision: 'PENDING',
      }).expect(400);
      await post(admin.token, `${ana.id}/verification`, {}).expect(400);
    });

    it('un admin no decide sobre su propia cuenta; un estudiante recibe 403', async () => {
      const admin = await signUpAdmin('admin');
      const ana = await signUp('ana');
      const beto = await signUp('beto');

      const self = await post(admin.token, `${admin.id}/verification`, {
        decision: 'VERIFIED',
      }).expect(403);
      expect(self.body.code).toBe('CANNOT_ACT_ON_SELF');
      await post(ana.token, `${beto.id}/verification`, {
        decision: 'VERIFIED',
      }).expect(403);
    });
  });
});
