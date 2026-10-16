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

// Subida de archivos (spec 0008, decisión 13) con Blob en memoria.
const PASSWORD = 'clave-segura-2026';
const MB = 1024 * 1024;
const PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d,
]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);
const PDF = Buffer.from('%PDF-1.7\n%fin');
const padded = (head: Buffer, size: number) =>
  Buffer.concat([head, Buffer.alloc(size - head.length)]);

async function startApp(
  storage?: MediaStorage,
): Promise<NestExpressApplication> {
  const builder = Test.createTestingModule({ imports: [AppModule] });
  if (storage) builder.overrideProvider(MediaStorage).useValue(storage);
  const app = (
    await builder.compile()
  ).createNestApplication<NestExpressApplication>();
  configureApp(app);
  await app.init();
  return app;
}

async function signUp(server: App, handle: string, careerId: string) {
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
}

describe('Subida de archivos (e2e)', () => {
  let app: NestExpressApplication;
  let server: App;
  let prisma: PrismaService;
  let storage: MemoryMediaStorage;
  let careerId: string;

  beforeAll(async () => {
    storage = new MemoryMediaStorage();
    app = await startApp(storage);
    server = app.getHttpServer();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    storage.objects.clear();
    careerId = (
      await prisma.career.create({ data: { name: 'Ingeniería de Software' } })
    ).id;
  });

  const upload = (token: string, data: Buffer, filename: string) =>
    request(server)
      .post('/api/v1/uploads')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', data, filename);

  it('sube una imagen válida y responde la clave, el tipo y un enlace de lectura', async () => {
    const ana = await signUp(server, 'ana', careerId);

    const res = await upload(ana.token, PNG, 'foto.png').expect(201);

    expect(res.body).toMatchObject({
      mediaType: 'IMAGE',
      mimeType: 'image/png',
      sizeBytes: PNG.length,
    });
    expect(res.body.key).toMatch(/^image\/[0-9a-f-]{36}\.png$/);
    expect(res.body.url).toContain(`https://blob.test/media/${res.body.key}`);
    expect(storage.objects.get(res.body.key)).toMatchObject({
      contentType: 'image/png',
      ownerId: ana.id,
    });
  });

  it('decide el tipo por los bytes: un PDF llamado .jpg se guarda como PDF', async () => {
    const ana = await signUp(server, 'ana', careerId);

    const res = await upload(ana.token, PDF, 'tarea.jpg').expect(201);

    expect(res.body.mediaType).toBe('DOCUMENT');
    expect(res.body.key).toMatch(/^document\/.+\.pdf$/);
  });

  it('rechaza un formato no soportado con UNSUPPORTED_MEDIA_TYPE y la lista de formatos', async () => {
    const ana = await signUp(server, 'ana', careerId);

    const res = await upload(
      ana.token,
      Buffer.from('no soy una imagen'),
      'foto.jpg',
    ).expect(415);

    expect(res.body.code).toBe('UNSUPPORTED_MEDIA_TYPE');
    expect(res.body.message).toContain('JPG, PNG, WebP o GIF');
    expect(storage.objects.size).toBe(0);
  });

  it('rechaza una imagen de más de 5 MB con FILE_TOO_LARGE', async () => {
    const ana = await signUp(server, 'ana', careerId);

    const res = await upload(
      ana.token,
      padded(JPEG, 5 * MB + 1),
      'grande.jpg',
    ).expect(413);

    expect(res.body.code).toBe('FILE_TOO_LARGE');
  });

  it('corta en 25 MB antes de leer el tipo, también con FILE_TOO_LARGE', async () => {
    const ana = await signUp(server, 'ana', careerId);

    const res = await upload(
      ana.token,
      padded(JPEG, 25 * MB + 1),
      'enorme.jpg',
    ).expect(413);

    expect(res.body.code).toBe('FILE_TOO_LARGE');
  });

  it('sin archivo responde FILE_REQUIRED y sin token 401', async () => {
    const ana = await signUp(server, 'ana', careerId);
    const res = await request(server)
      .post('/api/v1/uploads')
      .set('Authorization', `Bearer ${ana.token}`)
      .expect(400);
    expect(res.body.code).toBe('FILE_REQUIRED');

    await request(server)
      .post('/api/v1/uploads')
      .attach('file', PNG, 'foto.png')
      .expect(401);
  });

  const seedPost = (
    authorId: string,
    content: string,
    extra: Record<string, unknown> = {},
  ) =>
    prisma.post.create({ data: { authorId, content, type: 'TEXT', ...extra } });
  const getAs = (token: string, path: string) =>
    request(server)
      .get(`/api/v1${path}`)
      .set('Authorization', `Bearer ${token}`);
  const contents = (body: { items: { content: string | null }[] }) =>
    body.items.map((p) => p.content);

  it('bug 1029: ?resources=true deja solo las publicaciones con un PDF, para los Recursos del perfil', async () => {
    const ana = await signUp(server, 'ana', careerId);
    const doc = await seedPost(ana.id, 'pensum en PDF');
    await prisma.postMedia.create({
      data: {
        postId: doc.id,
        storageKey: 'posts/pensum.pdf',
        mediaType: 'DOCUMENT',
        mimeType: 'application/pdf',
        sizeBytes: 1024,
        position: 0,
      },
    });
    const foto = await seedPost(ana.id, 'con foto');
    await prisma.postMedia.create({
      data: {
        postId: foto.id,
        storageKey: 'posts/foto.png',
        mediaType: 'IMAGE',
        mimeType: 'image/png',
        sizeBytes: 1024,
        position: 0,
      },
    });
    await seedPost(ana.id, 'solo texto');
    await seedPost(ana.id, 'PDF archivado', {
      archivedAt: new Date(),
      media: {
        create: {
          storageKey: 'posts/viejo.pdf',
          mediaType: 'DOCUMENT',
          mimeType: 'application/pdf',
          sizeBytes: 1024,
          position: 0,
        },
      },
    });

    const recursos = await getAs(
      ana.token,
      `/users/${ana.id}/posts?resources=true`,
    ).expect(200);
    expect(contents(recursos.body)).toEqual(['pensum en PDF']);
    const todas = await getAs(
      ana.token,
      `/users/${ana.id}/posts?resources=false`,
    ).expect(200);
    expect(contents(todas.body)).toHaveLength(3);
    await getAs(ana.token, `/users/${ana.id}/posts?resources=quizas`).expect(
      400,
    );
  });

  it('una publicación con la clave subida muestra el adjunto en el feed', async () => {
    const ana = await signUp(server, 'ana', careerId);
    const { key } = (await upload(ana.token, PNG, 'foto.png').expect(201))
      .body as { key: string };

    await request(server)
      .post('/api/v1/posts')
      .set('Authorization', `Bearer ${ana.token}`)
      .send({ content: 'Mi foto', mediaKeys: [key] })
      .expect(201);

    const feed = await request(server)
      .get('/api/v1/posts/feed')
      .set('Authorization', `Bearer ${ana.token}`)
      .expect(200);
    expect(feed.body.items[0].media).toEqual([
      {
        url: expect.stringContaining(`https://blob.test/media/${key}`),
        mediaType: 'IMAGE',
        mimeType: 'image/png',
      },
    ]);
  });

  it('no deja publicar con la clave que subió otra persona', async () => {
    const ana = await signUp(server, 'ana', careerId);
    const beto = await signUp(server, 'beto', careerId);
    const { key } = (await upload(ana.token, PNG, 'foto.png').expect(201))
      .body as { key: string };

    const res = await request(server)
      .post('/api/v1/posts')
      .set('Authorization', `Bearer ${beto.token}`)
      .send({ content: 'Robada', mediaKeys: [key] })
      .expect(400);

    expect(res.body.code).toBe('MEDIA_NOT_FOUND');
    expect(await prisma.post.count()).toBe(0);
  });
});

describe('Subida sin almacenamiento configurado (e2e)', () => {
  it('responde STORAGE_UNAVAILABLE', async () => {
    const app = await startApp();
    const server = app.getHttpServer();
    const prisma = app.get(PrismaService);
    await resetDb(prisma);
    const careerId = (
      await prisma.career.create({ data: { name: 'Medicina' } })
    ).id;
    const ana = await signUp(server, 'ana', careerId);

    const res = await request(server)
      .post('/api/v1/uploads')
      .set('Authorization', `Bearer ${ana.token}`)
      .attach('file', PNG, 'foto.png')
      .expect(503);

    expect(res.body.code).toBe('STORAGE_UNAVAILABLE');
    await app.close();
  });
});
