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

// Crear y ver historias (funcionalidad 22, HU12 y HU13) contra PostgreSQL real.
const PASSWORD = 'clave-segura-2026';
const PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d,
]);
const PDF = Buffer.from('%PDF-1.7\n%fin');
const HOUR_MS = 60 * 60 * 1000;

interface Group {
  author: { handle: string; displayName: string; avatarUrl: string | null };
  stories: { text: string | null }[];
}

interface Account {
  id: string;
  token: string;
}

describe('Crear y ver historias (e2e)', () => {
  let app: NestExpressApplication;
  let server: App;
  let prisma: PrismaService;
  let storage: MemoryMediaStorage;
  let careerId: string;

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

  const auth = (account: Account) => ({
    Authorization: `Bearer ${account.token}`,
    'User-Agent': 'cafeta-e2e',
  });

  const upload = async (account: Account, data: Buffer, name: string) => {
    const res = await request(server)
      .post('/api/v1/uploads')
      .set(auth(account))
      .attach('file', data, name)
      .expect(201);
    return res.body.key as string;
  };

  const publish = async (account: Account, text?: string) => {
    const mediaKey = await upload(account, PNG, 'foto.png');
    return request(server)
      .post('/api/v1/stories')
      .set(auth(account))
      .send({ mediaKey, ...(text ? { text } : {}) })
      .expect(201);
  };

  const tray = (account: Account) =>
    request(server).get('/api/v1/stories').set(auth(account));

  // Seguimiento aceptado, directo en la base: aquí se prueban las historias.
  const follow = (follower: Account, following: Account) =>
    prisma.follow.create({
      data: {
        followerId: follower.id,
        followingId: following.id,
        status: 'ACCEPTED',
      },
    });

  it('HU12: publica una imagen con texto, vence a las 24 h y queda auditada', async () => {
    const ana = await signUp('ana');

    const res = await publish(ana, '  Hoy en el campus  ');

    expect(res.body).toMatchObject({
      text: 'Hoy en el campus',
      media: { mediaType: 'IMAGE', mimeType: 'image/png' },
      editedAt: null,
    });
    expect(res.body.media.url).toContain('blob.test');
    const lifetime =
      Date.parse(res.body.expiresAt) - Date.parse(res.body.createdAt);
    expect(lifetime).toBe(24 * HOUR_MS);
    const audit = await prisma.auditLog.findFirst({
      where: { action: 'story.create', entityId: res.body.id },
    });
    expect(audit).not.toBeNull();
  });

  it('el texto es opcional; la imagen o el video no', async () => {
    const ana = await signUp('ana');

    const sinTexto = await publish(ana);
    expect(sinTexto.body.text).toBeNull();

    await request(server)
      .post('/api/v1/stories')
      .set(auth(ana))
      .send({ text: 'sin medio' })
      .expect(400);
  });

  it('rechaza un PDF, un archivo ajeno o inexistente y un texto de más de 280', async () => {
    const ana = await signUp('ana');
    const beto = await signUp('beto');

    const pdfKey = await upload(ana, PDF, 'tesis.pdf');
    const pdf = await request(server)
      .post('/api/v1/stories')
      .set(auth(ana))
      .send({ mediaKey: pdfKey })
      .expect(400);
    expect(pdf.body.code).toBe('STORY_MEDIA_INVALID');

    const ajena = await upload(beto, PNG, 'foto.png');
    const ajeno = await request(server)
      .post('/api/v1/stories')
      .set(auth(ana))
      .send({ mediaKey: ajena })
      .expect(400);
    expect(ajeno.body.code).toBe('MEDIA_NOT_FOUND');

    const inexistente = await request(server)
      .post('/api/v1/stories')
      .set(auth(ana))
      .send({ mediaKey: 'image/11111111-1111-4111-8111-111111111111.png' })
      .expect(400);
    expect(inexistente.body.code).toBe('MEDIA_NOT_FOUND');

    const largo = await upload(ana, PNG, 'foto.png');
    await request(server)
      .post('/api/v1/stories')
      .set(auth(ana))
      .send({ mediaKey: largo, text: 'a'.repeat(281) })
      .expect(400);
    expect(await prisma.story.count()).toBe(0);
  });

  it('HU13: ve las propias y las de quien sigue, y no las de quien no sigue', async () => {
    const ana = await signUp('ana');
    const beto = await signUp('beto');
    const clara = await signUp('clara');
    await follow(beto, ana);
    await publish(ana, 'de Ana');
    await publish(beto, 'de Beto');

    const deBeto = await tray(beto).expect(200);
    expect(deBeto.body.groups.map((g: Group) => g.author.handle)).toEqual([
      'beto',
      'ana',
    ]);

    // Clara no sigue a nadie: solo ve lo suyo (nada).
    const deClara = await tray(clara).expect(200);
    expect(deClara.body.groups).toEqual([]);

    // Ana no sigue a Beto: ve la suya y no la de él.
    const deAna = await tray(ana).expect(200);
    expect(deAna.body.groups.map((g: Group) => g.author.handle)).toEqual([
      'ana',
    ]);
  });

  it('agrupa por autor: el de la historia más reciente primero y cada grupo en orden de publicación', async () => {
    const ana = await signUp('ana');
    const beto = await signUp('beto');
    const clara = await signUp('clara');
    await follow(clara, ana);
    await follow(clara, beto);
    await publish(ana, 'ana 1');
    await publish(beto, 'beto 1');
    await publish(ana, 'ana 2');

    const res = await tray(clara).expect(200);

    expect(res.body.groups.map((g: Group) => g.author.handle)).toEqual([
      'ana',
      'beto',
    ]);
    expect(
      res.body.groups[0].stories.map((s: { text: string | null }) => s.text),
    ).toEqual(['ana 1', 'ana 2']);
    expect(res.body.groups[0].author).toMatchObject({
      displayName: 'ana Prueba',
      avatarUrl: null,
    });
  });

  it('las vencidas y las desactivadas no se ven', async () => {
    const ana = await signUp('ana');
    const beto = await signUp('beto');
    await follow(beto, ana);
    const vencida = await publish(ana, 'vencida');
    const apagada = await publish(ana, 'apagada');
    await publish(ana, 'vigente');
    await prisma.story.update({
      where: { id: vencida.body.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await prisma.story.update({
      where: { id: apagada.body.id },
      data: { deactivatedAt: new Date() },
    });

    const res = await tray(beto).expect(200);

    expect(res.body.groups).toHaveLength(1);
    expect(
      res.body.groups[0].stories.map((s: { text: string | null }) => s.text),
    ).toEqual(['vigente']);
    // Los registros se conservan, solo dejan de verse.
    expect(await prisma.story.count()).toBe(3);
  });

  it('respeta la privacidad, los bloqueos y las cuentas desactivadas', async () => {
    const ana = await signUp('ana');
    const beto = await signUp('beto');
    await follow(beto, ana);
    await publish(ana, 'hola');
    const visibles = async () =>
      (await tray(beto).expect(200)).body.groups.length;
    expect(await visibles()).toBe(1);

    // PRIVATE: aunque la siga, no ve nada.
    await prisma.profile.update({
      where: { userId: ana.id },
      data: { visibility: 'PRIVATE' },
    });
    expect(await visibles()).toBe(0);

    // FOLLOWERS con seguimiento aceptado: se ve.
    await prisma.profile.update({
      where: { userId: ana.id },
      data: { visibility: 'FOLLOWERS' },
    });
    expect(await visibles()).toBe(1);

    // Seguimiento solo pendiente: no cuenta.
    await prisma.follow.updateMany({
      where: { followerId: beto.id },
      data: { status: 'PENDING' },
    });
    expect(await visibles()).toBe(0);
    await prisma.follow.updateMany({
      where: { followerId: beto.id },
      data: { status: 'ACCEPTED' },
    });
    expect(await visibles()).toBe(1);

    // Bloqueo en cualquier sentido.
    await prisma.block.create({
      data: { blockerId: ana.id, blockedId: beto.id },
    });
    expect(await visibles()).toBe(0);
    await prisma.block.updateMany({ data: { deactivatedAt: new Date() } });
    expect(await visibles()).toBe(1);

    // Cuenta desactivada.
    await prisma.user.update({
      where: { id: ana.id },
      data: { deactivatedAt: new Date() },
    });
    expect(await visibles()).toBe(0);
  });

  it('exige sesión', async () => {
    await request(server).get('/api/v1/stories').expect(401);
    await request(server).post('/api/v1/stories').send({}).expect(401);
  });
});
