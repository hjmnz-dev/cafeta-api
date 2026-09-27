import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { AuditService } from '../src/common/audit/audit.service.js';
import {
  ACTIVE,
  ACTIVE_AUTHOR,
} from '../src/common/soft-delete/soft-delete.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { AuditProbeModule } from './support/audit-probe.module.js';
import { resetDb } from './support/reset-db.js';

// Hilo completo del spec 0003 contra PostgreSQL real: desactivar, reactivar,
// auditar, 403 auditados y la guardia de borrado real.
async function bootApp(
  auditOverride?: Partial<AuditService>,
): Promise<NestExpressApplication> {
  const builder = Test.createTestingModule({
    imports: [AppModule, AuditProbeModule],
  });
  if (auditOverride) {
    builder.overrideProvider(AuditService).useValue(auditOverride);
  }
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>();
  configureApp(app);
  await app.init();
  return app;
}

const UA = 'cafeta-e2e';
const MISSING_ID = '01926f00-0000-7000-8000-00000000dead';

describe('Auditoría y baja lógica (e2e)', () => {
  let app: NestExpressApplication;
  let server: App;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await bootApp();
    server = app.getHttpServer();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDb(prisma);
  });

  const newCareer = (name = `Carrera ${Math.random()}`) =>
    prisma.career.create({ data: { name } });

  const auditRows = (action: string) =>
    prisma.auditLog.findMany({ where: { action } });

  it('AC-1 y AC-5: desactivar por admin marca la fila y audita con motivo', async () => {
    const career = await newCareer();
    await request(server)
      .post(`/api/v1/__probe__/admin/careers/${career.id}/deactivate`)
      .set('User-Agent', UA)
      .send({ reason: 'Carrera cerrada' })
      .expect(204);

    const row = await prisma.career.findUniqueOrThrow({
      where: { id: career.id },
    });
    expect(row.deactivatedAt).toBeInstanceOf(Date);

    const [entry] = await auditRows('career.deactivate');
    expect(entry).toMatchObject({
      entityType: 'career',
      entityId: career.id,
      succeeded: true,
      userAgent: UA,
      metadata: { by: 'admin', reason: 'Carrera cerrada' },
    });
    expect(entry?.ip).toBeTruthy();
  });

  it('AC-1: la ruta propia no lleva cuerpo y audita by = self', async () => {
    const career = await newCareer();
    await request(server)
      .post(`/api/v1/__probe__/careers/${career.id}/deactivate`)
      .expect(204);
    const [entry] = await auditRows('career.deactivate');
    expect(entry?.metadata).toEqual({ by: 'self' });
  });

  it('AC-5: sin motivo responde 400 VALIDATION_ERROR y no cambia nada', async () => {
    const career = await newCareer();
    const res = await request(server)
      .post(`/api/v1/__probe__/admin/careers/${career.id}/deactivate`)
      .send({})
      .expect(400);
    expect(res.body).toMatchObject({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
    });
    expect(await auditRows('career.deactivate')).toHaveLength(0);
  });

  it('AC-3: repetir da 409 ALREADY_INACTIVE y un id inexistente 404', async () => {
    const career = await newCareer();
    const url = `/api/v1/__probe__/careers/${career.id}/deactivate`;
    await request(server).post(url).expect(204);
    const again = await request(server).post(url).expect(409);
    expect(again.body.code).toBe('ALREADY_INACTIVE');

    const missing = await request(server)
      .post(`/api/v1/__probe__/careers/${MISSING_ID}/deactivate`)
      .expect(404);
    expect(missing.body.code).toBe('NOT_FOUND');
  });

  it('AC-3: dos desactivaciones simultáneas dan un solo éxito y una sola entrada', async () => {
    const career = await newCareer();
    const url = `/api/v1/__probe__/careers/${career.id}/deactivate`;
    const results = await Promise.all([
      request(server).post(url),
      request(server).post(url),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([204, 409]);
    expect(await auditRows('career.deactivate')).toHaveLength(1);
  });

  it('AC-4: reactivar vacía la marca, audita y repetir da 409 ALREADY_ACTIVE', async () => {
    const career = await newCareer();
    const base = `/api/v1/__probe__/admin/careers/${career.id}`;
    await request(server)
      .post(`${base}/deactivate`)
      .send({ reason: 'Prueba' })
      .expect(204);
    await request(server)
      .post(`${base}/reactivate`)
      .send({ reason: 'Vuelve a abrir' })
      .expect(204);

    const row = await prisma.career.findUniqueOrThrow({
      where: { id: career.id },
    });
    expect(row.deactivatedAt).toBeNull();
    expect(await auditRows('career.reactivate')).toHaveLength(1);

    const again = await request(server)
      .post(`${base}/reactivate`)
      .send({ reason: 'Otra vez' })
      .expect(409);
    expect(again.body.code).toBe('ALREADY_ACTIVE');
  });

  it('AC-6: un 403 queda en la bitácora como access.denied', async () => {
    const res = await request(server)
      .get('/api/v1/__probe__/forbidden?x=1')
      .set('User-Agent', UA)
      .expect(403);
    expect(res.body.code).toBe('FORBIDDEN');

    const [entry] = await auditRows('access.denied');
    expect(entry).toMatchObject({
      entityType: 'route',
      succeeded: false,
      actorId: null,
      userAgent: UA,
      metadata: {
        method: 'GET',
        route: '/api/v1/__probe__/forbidden',
        code: 'FORBIDDEN',
      },
    });
  });

  it('AC-7: la base impide el DELETE directo pero deja la cascada de posts', async () => {
    const author = await prisma.user.create({
      data: { email: 'autor@est.intec.edu.do', passwordHash: 'x' },
    });
    const reader = await prisma.user.create({
      data: { email: 'lector@est.intec.edu.do', passwordHash: 'x' },
    });
    await prisma.follow.create({
      data: {
        followerId: reader.id,
        followingId: author.id,
        status: 'ACCEPTED',
      },
    });
    await expect(
      prisma.$executeRawUnsafe('DELETE FROM "follows"'),
    ).rejects.toThrow(/baja lógica/);

    const post = await prisma.post.create({
      data: { authorId: author.id, content: 'Hola' },
    });
    await prisma.postComment.create({
      data: { postId: post.id, authorId: reader.id, content: 'Buenas' },
    });
    await prisma.post.delete({ where: { id: post.id } });
    expect(await prisma.postComment.count({ where: { postId: post.id } })).toBe(
      0,
    );
  });

  it('AC-8: ACTIVE y ACTIVE_AUTHOR ocultan lo desactivado y a sus autores', async () => {
    const [open, closed] = [
      await newCareer('Abierta'),
      await newCareer('Cerrada'),
    ];
    await request(server)
      .post(`/api/v1/__probe__/careers/${closed.id}/deactivate`)
      .expect(204);
    const list = await request(server)
      .get('/api/v1/__probe__/careers')
      .expect(200);
    expect(list.body.map((c: { id: string }) => c.id)).toEqual([open.id]);

    const active = await prisma.user.create({
      data: { email: 'activo@est.intec.edu.do', passwordHash: 'x' },
    });
    const gone = await prisma.user.create({
      data: {
        email: 'inactivo@est.intec.edu.do',
        passwordHash: 'x',
        deactivatedAt: new Date(),
      },
    });
    const visible = await prisma.post.create({
      data: { authorId: active.id, content: 'Se ve' },
    });
    await prisma.post.create({
      data: { authorId: gone.id, content: 'No se ve' },
    });
    await prisma.post.create({
      data: {
        authorId: active.id,
        content: 'Oculta',
        deactivatedAt: new Date(),
      },
    });
    const posts = await prisma.post.findMany({
      where: { ...ACTIVE, ...ACTIVE_AUTHOR },
    });
    expect(posts.map((p) => p.id)).toEqual([visible.id]);
  });
});

describe('Auditoría: atomicidad (e2e)', () => {
  it('AC-2: si la bitácora falla, la desactivación se deshace', async () => {
    const app = await bootApp({
      record: () => Promise.reject(new Error('bitácora caída')),
      recordStandalone: async () => undefined,
    });
    const prisma = app.get(PrismaService);
    try {
      await resetDb(prisma);
      const career = await prisma.career.create({ data: { name: 'Atómica' } });
      const res = await request(app.getHttpServer())
        .post(`/api/v1/__probe__/careers/${career.id}/deactivate`)
        .expect(500);
      expect(res.body.code).toBe('INTERNAL_SERVER_ERROR');
      const row = await prisma.career.findUniqueOrThrow({
        where: { id: career.id },
      });
      expect(row.deactivatedAt).toBeNull();
    } finally {
      await app.close();
    }
  });
});
