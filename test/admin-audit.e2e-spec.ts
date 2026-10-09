import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { AUDIT_ACTIONS } from '../src/common/audit/audit-actions.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { resetDb } from './support/reset-db.js';

// Bitácora de la consola (spec 0009, decisión 34) contra PostgreSQL real.
const PASSWORD = 'clave-segura-2026';
const BASE = '/api/v1/admin/audit-logs';

describe('Bitácora de auditoría del admin (e2e)', () => {
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

  const list = (token: string, query = '') =>
    request(server)
      .get(`${BASE}${query}`)
      .set('Authorization', `Bearer ${token}`);

  // Registros con fecha fija, escritos directo en la tabla para no depender
  // de la hora real.
  const seed = (
    data: {
      actorId?: string | null;
      actorRole?: 'ADMIN' | 'STUDENT';
      action: string;
      entityType?: string;
      succeeded?: boolean;
      createdAt: string;
    }[],
  ) =>
    prisma.auditLog.createMany({
      data: data.map((d) => ({
        actorId: d.actorId ?? null,
        actorRole: d.actorRole ?? null,
        action: d.action,
        entityType: d.entityType ?? 'post',
        succeeded: d.succeeded ?? true,
        ip: '10.0.0.1',
        userAgent: 'secreto-del-navegador',
        createdAt: new Date(d.createdAt),
      })),
    });

  // El registro del alta queda en la tabla; TRUNCATE no dispara el trigger que
  // impide borrar filas, y así cada prueba parte de una bitácora conocida.
  const clearRegistrations = () =>
    prisma.$executeRawUnsafe('TRUNCATE TABLE audit_logs');

  describe('GET /admin/audit-logs', () => {
    it('lista del más reciente al más antiguo, con quién, qué y cuándo', async () => {
      const admin = await signUpAdmin('admin');
      const ana = await signUp('ana');
      await clearRegistrations();
      await seed([
        {
          actorId: ana.id,
          actorRole: 'STUDENT',
          action: 'post.create',
          createdAt: '2026-10-01T10:00:00.000Z',
        },
        {
          actorId: admin.id,
          actorRole: 'ADMIN',
          action: 'post.deactivate',
          createdAt: '2026-10-02T10:00:00.000Z',
        },
      ]);

      const res = await list(admin.token).expect(200);

      expect(res.body.items.map((e: { action: string }) => e.action)).toEqual([
        'post.deactivate',
        'post.create',
      ]);
      expect(res.body.items[1]).toMatchObject({
        createdAt: '2026-10-01T10:00:00.000Z',
        actor: {
          id: ana.id,
          email: ana.email,
          handle: 'ana',
          role: 'STUDENT',
        },
        entityType: 'post',
        succeeded: true,
        ip: '10.0.0.1',
      });
      expect(res.body.nextCursor).toBeNull();
    });

    it('no muestra el userAgent', async () => {
      const admin = await signUpAdmin('admin');
      await clearRegistrations();
      await seed([
        { action: 'post.create', createdAt: '2026-10-01T10:00:00.000Z' },
      ]);

      const res = await list(admin.token).expect(200);

      expect(JSON.stringify(res.body)).not.toContain('secreto-del-navegador');
    });

    it('filtra por actor (correo o usuario), acción, entidad y resultado', async () => {
      const admin = await signUpAdmin('admin');
      const ana = await signUp('anaperez');
      await clearRegistrations();
      await seed([
        {
          actorId: ana.id,
          action: 'post.create',
          createdAt: '2026-10-01T10:00:00.000Z',
        },
        {
          actorId: ana.id,
          action: 'story.create',
          entityType: 'story',
          createdAt: '2026-10-01T11:00:00.000Z',
        },
        {
          actorId: admin.id,
          action: 'access.denied',
          entityType: 'route',
          succeeded: false,
          createdAt: '2026-10-01T12:00:00.000Z',
        },
      ]);

      const byHandle = await list(admin.token, '?actor=ANAPE').expect(200);
      expect(byHandle.body.items).toHaveLength(2);
      const byEmail = await list(admin.token, '?actor=admin@EST').expect(200);
      expect(byEmail.body.items).toHaveLength(1);
      const byAction = await list(admin.token, '?action=story.create');
      expect(byAction.body.items).toHaveLength(1);
      const byEntity = await list(admin.token, '?entityType=route');
      expect(byEntity.body.items[0].action).toBe('access.denied');
      const failed = await list(admin.token, '?succeeded=false').expect(200);
      expect(failed.body.items).toHaveLength(1);
      expect(failed.body.items[0].succeeded).toBe(false);
      const ok = await list(admin.token, '?succeeded=true').expect(200);
      expect(ok.body.items).toHaveLength(2);
    });

    it('combina los filtros con "y"', async () => {
      const admin = await signUpAdmin('admin');
      const ana = await signUp('ana');
      await clearRegistrations();
      await seed([
        {
          actorId: ana.id,
          action: 'post.create',
          createdAt: '2026-10-01T10:00:00.000Z',
        },
        {
          actorId: admin.id,
          action: 'post.create',
          createdAt: '2026-10-01T11:00:00.000Z',
        },
      ]);

      const res = await list(
        admin.token,
        '?actor=ana&action=post.create',
      ).expect(200);

      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].actor.id).toBe(ana.id);
    });

    it('el rango usa días completos de Santo Domingo y los dos extremos entran', async () => {
      const admin = await signUpAdmin('admin');
      await clearRegistrations();
      await seed([
        // 2026-09-30 23:59 en Santo Domingo: fuera
        { action: 'post.create', createdAt: '2026-10-01T03:59:00.000Z' },
        // 2026-10-01 00:00 en Santo Domingo: dentro
        { action: 'post.update', createdAt: '2026-10-01T04:00:00.000Z' },
        // 2026-10-02 23:59 en Santo Domingo: dentro
        { action: 'post.archive', createdAt: '2026-10-03T03:59:00.000Z' },
        // 2026-10-03 00:00 en Santo Domingo: fuera
        { action: 'post.restore', createdAt: '2026-10-03T04:00:00.000Z' },
      ]);

      const res = await list(
        admin.token,
        '?from=2026-10-01&to=2026-10-02',
      ).expect(200);

      expect(res.body.items.map((e: { action: string }) => e.action)).toEqual([
        'post.archive',
        'post.update',
      ]);
      const onlyFrom = await list(admin.token, '?from=2026-10-03').expect(200);
      expect(onlyFrom.body.items).toHaveLength(1);
      const onlyTo = await list(admin.token, '?to=2026-09-30').expect(200);
      expect(onlyTo.body.items).toHaveLength(1);
    });

    it('pagina con cursor sin repetir ni saltar filas', async () => {
      const admin = await signUpAdmin('admin');
      await clearRegistrations();
      await seed(
        Array.from({ length: 5 }, (_, i) => ({
          action: 'post.create',
          createdAt: `2026-10-0${i + 1}T10:00:00.000Z`,
        })),
      );

      const first = await list(admin.token, '?limit=2').expect(200);
      const second = await list(
        admin.token,
        `?limit=2&cursor=${first.body.nextCursor}`,
      ).expect(200);
      const third = await list(
        admin.token,
        `?limit=2&cursor=${second.body.nextCursor}`,
      ).expect(200);

      const ids = [first, second, third].flatMap((r) =>
        r.body.items.map((e: { id: string }) => e.id),
      );
      expect(ids).toHaveLength(5);
      expect(new Set(ids).size).toBe(5);
      expect(third.body.nextCursor).toBeNull();
    });

    it('rechaza un cursor que no es de esta lista', async () => {
      const admin = await signUpAdmin('admin');
      await clearRegistrations();
      await seed([
        { action: 'post.create', createdAt: '2026-10-01T10:00:00.000Z' },
        {
          action: 'story.create',
          entityType: 'story',
          createdAt: '2026-10-01T11:00:00.000Z',
        },
      ]);
      const all = await list(admin.token).expect(200);
      const story = all.body.items[0].id as string;

      const res = await list(
        admin.token,
        `?entityType=post&cursor=${story}`,
      ).expect(400);

      expect(res.body.code).toBe('INVALID_CURSOR');
    });

    it('from mayor que to da 400 INVALID_DATE_RANGE', async () => {
      const admin = await signUpAdmin('admin');

      const res = await list(
        admin.token,
        '?from=2026-10-05&to=2026-10-01',
      ).expect(400);

      expect(res.body.code).toBe('INVALID_DATE_RANGE');
    });

    it('una fecha mal escrita da 400 INVALID_DATE_RANGE', async () => {
      const admin = await signUpAdmin('admin');

      const res = await list(admin.token, '?from=ayer').expect(400);

      expect(res.body.code).toBe('INVALID_DATE_RANGE');
    });

    it('una acción fuera del catálogo da 400', async () => {
      const admin = await signUpAdmin('admin');

      await list(admin.token, '?action=algo.inventado').expect(400);
      await list(admin.token, '?succeeded=quizas').expect(400);
    });

    it('consultar la bitácora no deja registro', async () => {
      const admin = await signUpAdmin('admin');
      const before = await prisma.auditLog.count();

      await list(admin.token).expect(200);
      await list(admin.token, '?action=post.create').expect(200);
      await request(server)
        .get(`${BASE}/actions`)
        .set('Authorization', `Bearer ${admin.token}`)
        .expect(200);

      expect(await prisma.auditLog.count()).toBe(before);
    });

    it('un estudiante recibe 403 y queda access.denied; sin sesión 401', async () => {
      const ana = await signUp('ana');

      const res = await list(ana.token).expect(403);

      expect(res.body.code).toBe('FORBIDDEN');
      const denied = await prisma.auditLog.findMany({
        where: { action: 'access.denied', actorId: ana.id },
      });
      expect(denied).toHaveLength(1);
      await request(server).get(BASE).expect(401);
    });
  });

  describe('GET /admin/audit-logs/actions', () => {
    it('devuelve el catálogo de acciones', async () => {
      const admin = await signUpAdmin('admin');

      const res = await request(server)
        .get(`${BASE}/actions`)
        .set('Authorization', `Bearer ${admin.token}`)
        .expect(200);

      expect(res.body.actions).toEqual([...AUDIT_ACTIONS]);
    });

    it('un estudiante recibe 403', async () => {
      const ana = await signUp('ana');

      await request(server)
        .get(`${BASE}/actions`)
        .set('Authorization', `Bearer ${ana.token}`)
        .expect(403);
    });
  });

  describe('solo lectura', () => {
    it('ninguna ruta de escritura existe en la bitácora', async () => {
      const admin = await signUpAdmin('admin');
      const auth = { Authorization: `Bearer ${admin.token}` };

      await request(server).post(BASE).set(auth).send({}).expect(404);
      await request(server).patch(BASE).set(auth).send({}).expect(404);
      await request(server).delete(BASE).set(auth).expect(404);
      await request(server)
        .delete(`${BASE}/00000000-0000-7000-8000-000000000000`)
        .set(auth)
        .expect(404);
    });
  });
});
