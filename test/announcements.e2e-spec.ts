import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { MediaStorage } from '../src/modules/uploads/media-storage.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { MemoryMediaStorage } from './support/memory-media-storage.js';
import { resetDb } from './support/reset-db.js';

// Anuncios institucionales (spec 0009, decisión 36) contra PostgreSQL real.
const PASSWORD = 'clave-segura-2026';
const PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d,
]);
const PDF = Buffer.from('%PDF-1.4\n%âãÏÓ\n1 0 obj\n<<>>\nendobj\n');
const BASE = '/api/v1/admin/announcements';

interface Account {
  id: string;
  token: string;
}

describe('Anuncios institucionales (e2e)', () => {
  let app: NestExpressApplication;
  let server: App;
  let prisma: PrismaService;
  let storage: MemoryMediaStorage;
  let sistemas: string;
  let derecho: string;

  beforeAll(async () => {
    storage = new MemoryMediaStorage();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MediaStorage)
      .useValue(storage)
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
    storage.objects.clear();
    sistemas = (await prisma.career.create({ data: { name: 'Sistemas' } })).id;
    derecho = (await prisma.career.create({ data: { name: 'Derecho' } })).id;
  });

  const signUp = async (
    handle: string,
    careerId = sistemas,
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

  const signUpAdmin = async (handle: string, careerId = sistemas) => {
    const admin = await signUp(handle, careerId);
    await prisma.user.update({
      where: { id: admin.id },
      data: { role: 'ADMIN' },
    });
    return admin;
  };

  const call = (
    account: Account,
    method: 'post' | 'patch' | 'get',
    path: string,
  ) =>
    request(server)
      [method](`/api/v1${path}`)
      .set('Authorization', `Bearer ${account.token}`)
      .set('User-Agent', 'cafeta-e2e');

  const announce = (admin: Account, body: Record<string, unknown>) =>
    call(admin, 'post', '/admin/announcements').send(body);

  const upload = async (account: Account, bytes: Buffer, name: string) =>
    (
      await call(account, 'post', '/uploads')
        .attach('file', bytes, name)
        .expect(201)
    ).body.key as string;

  const feed = async (account: Account, query = '') =>
    (await call(account, 'get', `/posts/feed${query}`).expect(200)).body
      .items as { id: string; type: string; content: string }[];

  describe('POST /admin/announcements', () => {
    it('un admin publica: tipo ANNOUNCEMENT, él como autor y auditoría announcement.create', async () => {
      const admin = await signUpAdmin('admin');

      const res = await announce(admin, {
        content: '  Aviso oficial  ',
      }).expect(201);

      expect(res.body).toMatchObject({
        type: 'ANNOUNCEMENT',
        content: 'Aviso oficial',
        author: { id: admin.id },
      });
      const post = await prisma.post.findUniqueOrThrow({
        where: { id: res.body.id },
      });
      expect(post).toMatchObject({ type: 'ANNOUNCEMENT', authorId: admin.id });
      const logs = await prisma.auditLog.findMany({
        where: { entityId: res.body.id },
      });
      expect(logs.map((l) => l.action)).toEqual(['announcement.create']);
      expect(logs[0]).toMatchObject({ actorId: admin.id, succeeded: true });
    });

    it('no genera notificaciones', async () => {
      const admin = await signUpAdmin('admin');
      await signUp('ana');

      await announce(admin, { content: 'Aviso' }).expect(201);

      expect(await prisma.notification.count()).toBe(0);
    });

    it('acepta los mismos adjuntos de las publicaciones', async () => {
      const admin = await signUpAdmin('admin');
      const a = await upload(admin, PNG, 'a.png');
      const b = await upload(admin, PNG, 'b.png');

      const res = await announce(admin, {
        content: 'Con fotos',
        mediaKeys: [a, b],
      }).expect(201);

      expect(res.body.media).toHaveLength(2);
      expect(res.body.media[0].mediaType).toBe('IMAGE');
    });

    it('rechaza mezclar un PDF con una imagen, y una clave que no es suya', async () => {
      const admin = await signUpAdmin('admin');
      const ana = await signUp('ana');
      const image = await upload(admin, PNG, 'a.png');
      const pdf = await upload(admin, PDF, 'a.pdf');
      const foreign = await upload(ana, PNG, 'ana.png');

      const mixed = await announce(admin, {
        content: 'Mezcla',
        mediaKeys: [image, pdf],
      }).expect(400);
      const stolen = await announce(admin, {
        content: 'Ajena',
        mediaKeys: [foreign],
      }).expect(400);

      expect(mixed.body.code).toBe('MEDIA_COMBINATION_INVALID');
      expect(stolen.body.code).toBe('MEDIA_NOT_FOUND');
      expect(await prisma.post.count()).toBe(0);
    });

    it('el texto es obligatorio: vacío, solo espacios o ausente da 400', async () => {
      const admin = await signUpAdmin('admin');
      const image = await upload(admin, PNG, 'a.png');

      for (const body of [
        { content: '' },
        { content: '   ' },
        { content: '   ', mediaKeys: [image] },
        {},
      ]) {
        await announce(admin, body).expect(400);
      }
      const tooLong = await announce(admin, { content: 'x'.repeat(2001) });
      expect(tooLong.status).toBe(400);
      expect(await prisma.post.count()).toBe(0);
    });

    it('el tipo y el autor salen del servidor: un cuerpo con otro tipo se rechaza', async () => {
      const admin = await signUpAdmin('admin');

      await announce(admin, { content: 'Aviso', type: 'TEXT' }).expect(400);
      await announce(admin, { content: 'Aviso', authorId: admin.id }).expect(
        400,
      );
    });

    it('un estudiante recibe 403 y queda access.denied; sin sesión 401', async () => {
      const ana = await signUp('ana');

      const res = await announce(ana, { content: 'Aviso' }).expect(403);

      expect(res.body.code).toBe('FORBIDDEN');
      expect(await prisma.post.count()).toBe(0);
      const denied = await prisma.auditLog.findMany({
        where: { action: 'access.denied', actorId: ana.id },
      });
      expect(denied).toHaveLength(1);
      await request(server).post(BASE).send({ content: 'Aviso' }).expect(401);
    });
  });

  describe('POST /posts con type ANNOUNCEMENT', () => {
    it('da 403 ANNOUNCEMENT_NOT_ALLOWED a un estudiante y también a un admin', async () => {
      const admin = await signUpAdmin('admin');
      const ana = await signUp('ana');

      for (const who of [ana, admin]) {
        const res = await call(who, 'post', '/posts')
          .send({ content: 'Aviso', type: 'ANNOUNCEMENT' })
          .expect(403);
        expect(res.body.code).toBe('ANNOUNCEMENT_NOT_ALLOWED');
      }
      expect(await prisma.post.count()).toBe(0);
    });

    it('una publicación común sigue siendo TEXT', async () => {
      const ana = await signUp('ana');

      const res = await call(ana, 'post', '/posts')
        .send({ content: 'Hola' })
        .expect(201);

      expect(res.body.type).toBe('TEXT');
    });
  });

  describe('quién los ve', () => {
    it('todos los usuarios activos, sin seguir al admin, en Para ti y en cualquier carrera', async () => {
      const admin = await signUpAdmin('admin', sistemas);
      const ana = await signUp('ana', derecho);
      const published = await announce(admin, { content: 'Aviso' }).expect(201);

      const forYou = await feed(ana);
      const inDerecho = await feed(ana, `?careerId=${derecho}`);
      const inSistemas = await feed(ana, `?careerId=${sistemas}`);

      expect(forYou.map((p) => p.id)).toEqual([published.body.id]);
      expect(inDerecho.map((p) => p.id)).toEqual([published.body.id]);
      expect(inSistemas.map((p) => p.id)).toEqual([published.body.id]);
    });

    it('no depende de la privacidad del admin ni de un bloqueo', async () => {
      const admin = await signUpAdmin('admin');
      const ana = await signUp('ana');
      await prisma.profile.update({
        where: { userId: admin.id },
        data: { visibility: 'PRIVATE' },
      });
      await prisma.block.create({
        data: { blockerId: ana.id, blockedId: admin.id },
      });
      const published = await announce(admin, { content: 'Aviso' }).expect(201);

      expect((await feed(ana)).map((p) => p.id)).toEqual([published.body.id]);
    });

    it('va en orden cronológico entre las demás, sin fijarse arriba', async () => {
      const admin = await signUpAdmin('admin');
      const ana = await signUp('ana');
      await call(ana, 'post', '/posts')
        .send({ content: 'Primera' })
        .expect(201);
      await announce(admin, { content: 'Aviso' }).expect(201);
      await call(ana, 'post', '/posts').send({ content: 'Última' }).expect(201);

      expect((await feed(ana)).map((p) => p.content)).toEqual([
        'Última',
        'Aviso',
        'Primera',
      ]);
    });

    it('un usuario desactivado no recibe nada; sus avisos no vuelven al reactivar a otro', async () => {
      const admin = await signUpAdmin('admin');
      const ana = await signUp('ana');
      await announce(admin, { content: 'Aviso' }).expect(201);

      await prisma.user.update({
        where: { id: ana.id },
        data: { deactivatedAt: new Date() },
      });

      await call(ana, 'get', '/posts/feed').expect(401);
    });
  });

  describe('editar y desactivar', () => {
    it('el admin edita su anuncio con PATCH /posts/:id y queda editado', async () => {
      const admin = await signUpAdmin('admin');
      const ana = await signUp('ana');
      const { body } = await announce(admin, { content: 'Aviso' }).expect(201);

      const edited = await call(admin, 'patch', `/posts/${body.id}`)
        .send({ content: 'Aviso corregido' })
        .expect(200);

      expect(edited.body).toMatchObject({
        type: 'ANNOUNCEMENT',
        content: 'Aviso corregido',
      });
      expect(edited.body.editedAt).not.toBeNull();
      expect((await feed(ana))[0]?.content).toBe('Aviso corregido');
    });

    it('al desactivarlo con POST /posts/:id/deactivate sale del feed y se queda en la lista de la consola', async () => {
      const admin = await signUpAdmin('admin');
      const ana = await signUp('ana');
      const { body } = await announce(admin, { content: 'Aviso' }).expect(201);

      await call(admin, 'post', `/posts/${body.id}/deactivate`).expect(204);

      expect(await feed(ana)).toEqual([]);
      const list = await call(admin, 'get', '/admin/announcements').expect(200);
      expect(list.body.items).toHaveLength(1);
      expect(list.body.items[0]).toMatchObject({
        id: body.id,
        active: false,
      });
      expect(list.body.items[0].deactivatedAt).not.toBeNull();
    });

    it('un anuncio archivado tampoco sale en el feed', async () => {
      const admin = await signUpAdmin('admin');
      const ana = await signUp('ana');
      const { body } = await announce(admin, { content: 'Aviso' }).expect(201);

      await prisma.post.update({
        where: { id: body.id },
        data: { archivedAt: new Date() },
      });

      expect(await feed(ana)).toEqual([]);
    });

    it('un estudiante no puede editar ni desactivar el anuncio de un admin', async () => {
      const admin = await signUpAdmin('admin');
      const ana = await signUp('ana');
      const { body } = await announce(admin, { content: 'Aviso' }).expect(201);

      const patch = await call(ana, 'patch', `/posts/${body.id}`).send({
        content: 'Hackeado',
      });
      const off = await call(ana, 'post', `/posts/${body.id}/deactivate`);

      expect([403, 404]).toContain(patch.status);
      expect([403, 404]).toContain(off.status);
      const post = await prisma.post.findUniqueOrThrow({
        where: { id: body.id },
      });
      expect(post).toMatchObject({ content: 'Aviso', deactivatedAt: null });
    });
  });

  describe('GET /admin/announcements', () => {
    it('lista solo anuncios, activos y desactivados, del más nuevo al más antiguo', async () => {
      const admin = await signUpAdmin('admin');
      const ana = await signUp('ana');
      const first = await announce(admin, { content: 'Uno' }).expect(201);
      const second = await announce(admin, { content: 'Dos' }).expect(201);
      await call(ana, 'post', '/posts').send({ content: 'Común' }).expect(201);
      await call(admin, 'post', `/posts/${first.body.id}/deactivate`).expect(
        204,
      );

      const res = await call(admin, 'get', '/admin/announcements').expect(200);

      expect(res.body.items.map((a: { id: string }) => a.id)).toEqual([
        second.body.id,
        first.body.id,
      ]);
      expect(res.body.items[0]).toMatchObject({
        content: 'Dos',
        active: true,
        deactivatedAt: null,
        publishedBy: 'admin Prueba',
        reactionCount: 0,
        commentCount: 0,
        media: [],
      });
      expect(res.body.items[1].active).toBe(false);
      expect(res.body.nextCursor).toBeNull();
    });

    it('trae los adjuntos con su enlace', async () => {
      const admin = await signUpAdmin('admin');
      const key = await upload(admin, PNG, 'a.png');
      await announce(admin, { content: 'Con foto', mediaKeys: [key] }).expect(
        201,
      );

      const res = await call(admin, 'get', '/admin/announcements').expect(200);

      expect(res.body.items[0].media).toHaveLength(1);
      expect(res.body.items[0].media[0]).toMatchObject({
        mediaType: 'IMAGE',
        mimeType: 'image/png',
      });
      expect(res.body.items[0].media[0].url).toEqual(expect.any(String));
    });

    it('pagina con cursor sin repetir ni saltar', async () => {
      const admin = await signUpAdmin('admin');
      for (let i = 1; i <= 5; i++) {
        await announce(admin, { content: `Aviso ${i}` }).expect(201);
      }

      const first = await call(admin, 'get', '/admin/announcements?limit=2');
      const second = await call(
        admin,
        'get',
        `/admin/announcements?limit=2&cursor=${first.body.nextCursor}`,
      );
      const third = await call(
        admin,
        'get',
        `/admin/announcements?limit=2&cursor=${second.body.nextCursor}`,
      );

      const ids = [first, second, third].flatMap((r) =>
        r.body.items.map((a: { id: string }) => a.id),
      );
      expect(new Set(ids).size).toBe(5);
      expect(third.body.nextCursor).toBeNull();
    });

    it('el cursor de una publicación común da 400 INVALID_CURSOR', async () => {
      const admin = await signUpAdmin('admin');
      const ana = await signUp('ana');
      const common = await call(ana, 'post', '/posts')
        .send({ content: 'Común' })
        .expect(201);

      const res = await call(
        admin,
        'get',
        `/admin/announcements?cursor=${common.body.id}`,
      ).expect(400);

      expect(res.body.code).toBe('INVALID_CURSOR');
    });

    it('un estudiante recibe 403 y queda access.denied; sin sesión 401', async () => {
      const ana = await signUp('ana');

      const res = await call(ana, 'get', '/admin/announcements').expect(403);

      expect(res.body.code).toBe('FORBIDDEN');
      expect(
        await prisma.auditLog.count({
          where: { action: 'access.denied', actorId: ana.id },
        }),
      ).toBe(1);
      await request(server).get(BASE).expect(401);
    });
  });
});
