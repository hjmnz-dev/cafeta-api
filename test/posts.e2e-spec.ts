import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { AuditService } from '../src/common/audit/audit.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { resetDb } from './support/reset-db.js';

// Publicar y ver el feed (spec 0005) contra PostgreSQL real.
const PASSWORD = 'clave-segura-2026';

async function startApp(
  configure?: (builder: ReturnType<typeof Test.createTestingModule>) => void,
): Promise<NestExpressApplication> {
  const builder = Test.createTestingModule({ imports: [AppModule] });
  configure?.(builder);
  const app = (
    await builder.compile()
  ).createNestApplication<NestExpressApplication>();
  configureApp(app);
  await app.init();
  return app;
}

interface Account {
  id: string;
  token: string;
}

describe('Publicaciones (e2e)', () => {
  let app: NestExpressApplication;
  let server: App;
  let prisma: PrismaService;
  let softwareId: string;
  let medicinaId: string;

  beforeAll(async () => {
    app = await startApp();
    server = app.getHttpServer();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    softwareId = (
      await prisma.career.create({ data: { name: 'Ingeniería de Software' } })
    ).id;
    medicinaId = (await prisma.career.create({ data: { name: 'Medicina' } }))
      .id;
  });

  const signUp = async (
    handle: string,
    careerId = softwareId,
  ): Promise<Account> => {
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

  const publish = (account: Account, body: Record<string, unknown>) =>
    request(server)
      .post('/api/v1/posts')
      .set('Authorization', `Bearer ${account.token}`)
      .set('User-Agent', 'cafeta-e2e')
      .send(body);

  const get = (account: Account, path: string) =>
    request(server)
      .get(`/api/v1${path}`)
      .set('Authorization', `Bearer ${account.token}`);

  const follow = (
    followerId: string,
    followingId: string,
    status: 'ACCEPTED' | 'PENDING',
    deactivatedAt: Date | null = null,
  ) =>
    prisma.follow.create({
      data: { followerId, followingId, status, deactivatedAt },
    });

  const seedPost = (
    authorId: string,
    content: string,
    extra: Record<string, unknown> = {},
  ) =>
    prisma.post.create({ data: { authorId, content, type: 'TEXT', ...extra } });

  const contents = (body: { items: { content: string | null }[] }) =>
    body.items.map((p) => p.content);

  it('AC-1 y AC-13: publicar guarda el texto recortado como TEXT y audita post.create', async () => {
    const ana = await signUp('ana');
    const res = await publish(ana, {
      content: '  Hola INTEC  ',
      location: 'Biblioteca',
    }).expect(201);

    expect(res.body).toMatchObject({
      type: 'TEXT',
      content: 'Hola INTEC',
      location: 'Biblioteca',
      editedAt: null,
      author: {
        id: ana.id,
        handle: 'ana',
        displayName: 'ana Prueba',
        careerName: 'Ingeniería de Software',
        verified: false,
      },
      reactionCount: 0,
      commentCount: 0,
    });
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'post.create' },
    });
    expect(audit).toMatchObject({
      entityType: 'post',
      entityId: res.body.id,
      actorId: ana.id,
      actorRole: 'STUDENT',
      succeeded: true,
      userAgent: 'cafeta-e2e',
    });
    expect(audit.ip).not.toBeNull();
    expect(JSON.stringify(audit.metadata ?? {})).not.toContain('Hola');
  });

  it('AC-1: sin ubicación la guarda como null', async () => {
    const ana = await signUp('ana');
    const res = await publish(ana, { content: 'Sin lugar' }).expect(201);
    expect(res.body.location).toBeNull();
  });

  it('AC-2: rechaza vacío, sin content, largo, ubicación inventada y campos extra sin guardar nada', async () => {
    const ana = await signUp('ana');
    const empty = await publish(ana, { content: '   ' }).expect(400);
    expect(empty.body.code).toBe('POST_CONTENT_REQUIRED');

    const cases: Record<string, unknown>[] = [
      {},
      { content: 'a'.repeat(2001) },
      { content: 'Hola', location: 'Marte' },
      { content: 'Hola', type: 'EVENT' },
      { content: 'Hola', authorId: ana.id },
      { content: 123 },
    ];
    for (const body of cases) {
      const res = await publish(ana, body).expect(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    }
    expect(await prisma.post.count()).toBe(0);
  });

  it('AC-2: 2000 emojis con selector de variación dan 400 y no 500; 2000 caracteres pasan', async () => {
    const ana = await signUp('ana');
    const hearts = await publish(ana, { content: '❤️'.repeat(2000) }).expect(
      400,
    );
    expect(hearts.body.code).toBe('VALIDATION_ERROR');
    await publish(ana, { content: 'é'.repeat(2000) }).expect(201);
    await publish(ana, { content: `  ${'b'.repeat(2000)}  ` }).expect(201);
  });

  it('AC-4: "Para ti" junta mías, seguidos ACCEPTED activos y anuncios, y nada más', async () => {
    const a = await signUp('usuario_a');
    const b = await signUp('usuario_b');
    const c = await signUp('usuario_c');
    const d = await signUp('usuario_d');
    const e = await signUp('usuario_e');
    const admin = await prisma.user.create({
      data: {
        email: 'admin@intec.edu.do',
        passwordHash: 'x',
        role: 'ADMIN',
        profile: { create: { handle: 'cafeta', displayName: 'Cafeta' } },
      },
    });
    await follow(a.id, b.id, 'ACCEPTED');
    await follow(a.id, c.id, 'PENDING');
    await follow(a.id, d.id, 'ACCEPTED', new Date());
    await follow(a.id, e.id, 'ACCEPTED');

    await seedPost(a.id, 'de A');
    await seedPost(b.id, 'de B');
    await seedPost(b.id, 'de B archivada', { archivedAt: new Date() });
    await seedPost(b.id, 'de B desactivada', { deactivatedAt: new Date() });
    await seedPost(c.id, 'de C');
    await seedPost(d.id, 'de D');
    await seedPost(e.id, 'de E');
    await seedPost(admin.id, 'anuncio', { type: 'ANNOUNCEMENT' });
    await prisma.user.update({
      where: { id: e.id },
      data: { deactivatedAt: new Date() },
    });

    const res = await get(a, '/posts/feed').expect(200);
    expect(contents(res.body).sort()).toEqual(['anuncio', 'de A', 'de B']);
    expect(res.body.nextCursor).toBeNull();
    const announcement = res.body.items.find(
      (p: { type: string }) => p.type === 'ANNOUNCEMENT',
    );
    expect(announcement.author.careerName).toBeNull();
  });

  it('AC-5: pagina por cursor sin repetir ni saltar, aunque compartan created_at', async () => {
    const ana = await signUp('ana');
    const base = Date.parse('2026-09-01T12:00:00Z');
    for (let i = 0; i < 45; i++) {
      // Las publicaciones 10 y 11 comparten el mismo instante.
      const at = new Date(base + (i === 11 ? 10 : i) * 1000);
      await seedPost(ana.id, `p${i}`, { createdAt: at });
    }

    const seen: string[] = [];
    const sizes: number[] = [];
    let cursor: string | null = null;
    do {
      const query: string = cursor ? `?cursor=${cursor}` : '';
      const res = await get(ana, `/posts/feed${query}`).expect(200);
      sizes.push(res.body.items.length);
      seen.push(...res.body.items.map((p: { id: string }) => p.id));
      cursor = res.body.nextCursor;
    } while (cursor);

    expect(sizes).toEqual([20, 20, 5]);
    expect(new Set(seen).size).toBe(45);
    const ordered = await prisma.post.findMany({
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { id: true },
    });
    expect(seen).toEqual(ordered.map((p) => p.id));
  });

  it('AC-5: limit se respeta hasta 50 y un cursor inventado da INVALID_CURSOR', async () => {
    const ana = await signUp('ana');
    await seedPost(ana.id, 'uno');
    await seedPost(ana.id, 'dos');

    const page = await get(ana, '/posts/feed?limit=1').expect(200);
    expect(page.body.items).toHaveLength(1);
    expect(page.body.nextCursor).toBe(page.body.items[0].id);

    await get(ana, '/posts/feed?limit=51').expect(400);
    await get(ana, '/posts/feed?limit=0').expect(400);
    const bad = await get(
      ana,
      '/posts/feed?cursor=01926f00-0000-7000-8000-000000000000',
    ).expect(400);
    expect(bad.body.code).toBe('INVALID_CURSOR');
  });

  it('AC-6: la pestaña de carrera muestra a los de esa carrera, sin seguirlos y sin anuncios', async () => {
    const a = await signUp('usuario_a', medicinaId);
    const sw = await signUp('usuario_sw', softwareId);
    const med = await signUp('usuario_med', medicinaId);
    const admin = await prisma.user.create({
      data: {
        email: 'admin@intec.edu.do',
        passwordHash: 'x',
        role: 'ADMIN',
        profile: { create: { handle: 'cafeta', displayName: 'Cafeta' } },
      },
    });
    await seedPost(sw.id, 'de software');
    await seedPost(sw.id, 'archivada', { archivedAt: new Date() });
    await seedPost(med.id, 'de medicina');
    await seedPost(admin.id, 'anuncio', { type: 'ANNOUNCEMENT' });

    const res = await get(a, `/posts/feed?careerId=${softwareId}`).expect(200);
    expect(contents(res.body)).toEqual(['de software']);
  });

  it('AC-3 y AC-14: mis publicaciones y su conteo; las de un perfil limitado dan 403 y access.denied', async () => {
    const ana = await signUp('ana');
    const beto = await signUp('beto');
    await seedPost(ana.id, 'vieja', { createdAt: new Date('2026-01-01') });
    await seedPost(ana.id, 'archivada', { archivedAt: new Date() });
    await seedPost(beto.id, 'de beto');
    const created = await publish(ana, { content: 'nueva' }).expect(201);

    const mine = await get(ana, `/users/${ana.id}/posts`).expect(200);
    expect(contents(mine.body)).toEqual(['nueva', 'vieja']);
    expect(mine.body.items[0].id).toBe(created.body.id);
    const count = await get(ana, `/users/${ana.id}/posts/count`).expect(200);
    expect(count.body).toEqual({ count: 2 });

    // Beto es PUBLIC: Ana ve lo suyo (decisión 15).
    const public_ = await get(ana, `/users/${beto.id}/posts`).expect(200);
    expect(contents(public_.body)).toEqual(['de beto']);

    await prisma.profile.update({
      where: { userId: beto.id },
      data: { visibility: 'FOLLOWERS' },
    });
    const denied = await get(ana, `/users/${beto.id}/posts`).expect(403);
    expect(denied.body.code).toBe('PROFILE_RESTRICTED');
    const betoCount = await get(ana, `/users/${beto.id}/posts/count`).expect(
      200,
    );
    expect(betoCount.body).toEqual({ count: 1 });
    expect(
      await prisma.auditLog.count({ where: { action: 'access.denied' } }),
    ).toBe(1);

    await get(ana, '/users/no-es-uuid/posts').expect(400);
  });

  it('AC-8: la vista trae los campos propios de EVENT y los conteos de filas activas', async () => {
    const ana = await signUp('ana');
    const beto = await signUp('beto');
    const post = await seedPost(ana.id, 'Hackathon', {
      type: 'EVENT',
      eventStartsAt: new Date('2026-10-10T14:00:00Z'),
      eventLocation: 'Auditorio',
      editedAt: new Date(),
    });
    await prisma.postReaction.create({
      data: { postId: post.id, userId: ana.id, type: 'HEART' },
    });
    await prisma.postReaction.create({
      data: {
        postId: post.id,
        userId: beto.id,
        type: 'HEART',
        deactivatedAt: new Date(),
      },
    });
    await prisma.postComment.create({
      data: { postId: post.id, authorId: beto.id, content: 'Voy' },
    });

    const res = await get(ana, '/posts/feed').expect(200);
    expect(res.body.items[0]).toMatchObject({
      type: 'EVENT',
      eventStartsAt: '2026-10-10T14:00:00.000Z',
      eventLocation: 'Auditorio',
      reactionCount: 1,
      commentCount: 1,
    });
    expect(res.body.items[0].editedAt).not.toBeNull();
    expect(JSON.stringify(res.body)).not.toContain('@est.intec.edu.do');
  });

  it('AC-14: sin token todas las rutas responden 401', async () => {
    const id = '01926f00-0000-7000-8000-000000000000';
    await request(server)
      .post('/api/v1/posts')
      .send({ content: 'x' })
      .expect(401);
    await request(server).get('/api/v1/posts/feed').expect(401);
    await request(server).get(`/api/v1/users/${id}/posts`).expect(401);
    await request(server).get(`/api/v1/users/${id}/posts/count`).expect(401);
  });
});

// AC-13: si la bitácora falla, la publicación tampoco queda guardada.
class FailingAuditService extends AuditService {
  override record(): Promise<void> {
    return Promise.reject(new Error('bitácora caída'));
  }
}

describe('Publicaciones con la bitácora caída (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await startApp((builder) => {
      builder.overrideProvider(AuditService).useClass(FailingAuditService);
    });
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('AC-13: responde 500 y no guarda la publicación', async () => {
    await resetDb(prisma);
    const careerId = (
      await prisma.career.create({ data: { name: 'Ingeniería de Software' } })
    ).id;
    // El registro también audita, así que la cuenta se crea directo en la base
    // y el login (que no audita) entrega el token.
    await prisma.user.create({
      data: {
        email: 'ana@est.intec.edu.do',
        passwordHash: await bcrypt.hash(PASSWORD, 4),
        profile: { create: { handle: 'ana', displayName: 'Ana', careerId } },
      },
    });
    const server = app.getHttpServer();
    const login = await request(server)
      .post('/api/v1/auth/login')
      .send({ email: 'ana@est.intec.edu.do', password: PASSWORD })
      .expect(200);

    await request(server)
      .post('/api/v1/posts')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .send({ content: 'No debe quedar' })
      .expect(500);
    expect(await prisma.post.count()).toBe(0);
  });
});
