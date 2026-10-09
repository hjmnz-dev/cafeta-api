import { randomUUID } from 'node:crypto';
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

// Editar y desactivar historias (funcionalidad 23, HU14 y HU15) contra PostgreSQL real.
const PASSWORD = 'clave-segura-2026';
const PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d,
]);

interface Account {
  id: string;
  token: string;
}

describe('Editar y desactivar historias (e2e)', () => {
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

  const publish = async (account: Account, text = 'Texto original') => {
    const uploaded = await request(server)
      .post('/api/v1/uploads')
      .set(auth(account))
      .attach('file', PNG, 'foto.png')
      .expect(201);
    const res = await request(server)
      .post('/api/v1/stories')
      .set(auth(account))
      .send({ mediaKey: uploaded.body.key, text })
      .expect(201);
    return res.body as { id: string; expiresAt: string };
  };

  const edit = (account: Account, id: string, body: object) =>
    request(server)
      .patch(`/api/v1/stories/${id}`)
      .set(auth(account))
      .send(body);

  const deactivate = (account: Account, id: string) =>
    request(server).post(`/api/v1/stories/${id}/deactivate`).set(auth(account));

  const tray = (account: Account) =>
    request(server).get('/api/v1/stories').set(auth(account));

  // Una historia vencida, directo en la base: nadie la puede publicar ya vencida.
  const expire = (id: string) =>
    prisma.story.update({
      where: { id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

  it('HU14: editar cambia el texto, marca editedAt, conserva expiresAt y queda auditado', async () => {
    const ana = await signUp('ana');
    const story = await publish(ana);

    const res = await edit(ana, story.id, {
      text: '  Texto corregido  ',
    }).expect(200);

    expect(res.body).toMatchObject({
      id: story.id,
      text: 'Texto corregido',
      expiresAt: story.expiresAt,
    });
    expect(res.body.editedAt).not.toBeNull();
    const row = await prisma.story.findUniqueOrThrow({
      where: { id: story.id },
    });
    expect(row.expiresAt.toISOString()).toBe(story.expiresAt);
    const audit = await prisma.auditLog.findFirst({
      where: { action: 'story.update', entityId: story.id },
    });
    expect(audit).toMatchObject({ metadata: { by: 'self' } });
  });

  it('el texto puede quedar vacío porque el medio ya es obligatorio', async () => {
    const ana = await signUp('ana');
    const story = await publish(ana);

    const res = await edit(ana, story.id, { text: '   ' }).expect(200);

    expect(res.body.text).toBeNull();
    expect(res.body.media.mediaType).toBe('IMAGE');
  });

  it('la bandeja muestra el texto nuevo y la marca de editada', async () => {
    const ana = await signUp('ana');
    const story = await publish(ana);
    await edit(ana, story.id, { text: 'Nuevo' }).expect(200);

    const res = await tray(ana).expect(200);

    expect(res.body.groups[0].stories[0]).toMatchObject({
      id: story.id,
      text: 'Nuevo',
    });
    expect(res.body.groups[0].stories[0].editedAt).not.toBeNull();
  });

  it('rechaza más de 280 caracteres, un cuerpo sin texto y campos de más', async () => {
    const ana = await signUp('ana');
    const story = await publish(ana);

    await edit(ana, story.id, { text: 'a'.repeat(281) }).expect(400);
    await edit(ana, story.id, {}).expect(400);
    await edit(ana, story.id, { text: 'ok', mediaKey: 'otra' }).expect(400);
    await edit(ana, story.id, { text: 'a'.repeat(280) }).expect(200);
  });

  it('un ajeno recibe 403 NOT_STORY_AUTHOR al editar y al desactivar, y nada cambia', async () => {
    const ana = await signUp('ana');
    const beto = await signUp('beto');
    const story = await publish(ana);

    const editar = await edit(beto, story.id, { text: 'Hackeada' }).expect(403);
    const desactivar = await deactivate(beto, story.id).expect(403);

    expect(editar.body.code).toBe('NOT_STORY_AUTHOR');
    expect(desactivar.body.code).toBe('NOT_STORY_AUTHOR');
    const row = await prisma.story.findUniqueOrThrow({
      where: { id: story.id },
    });
    expect(row).toMatchObject({
      text: 'Texto original',
      editedAt: null,
      deactivatedAt: null,
    });
  });

  it('una historia vencida no se edita ni se desactiva: 409 STORY_EXPIRED', async () => {
    const ana = await signUp('ana');
    const story = await publish(ana);
    await expire(story.id);

    const editar = await edit(ana, story.id, { text: 'Tarde' }).expect(409);
    const desactivar = await deactivate(ana, story.id).expect(409);

    expect(editar.body.code).toBe('STORY_EXPIRED');
    expect(desactivar.body.code).toBe('STORY_EXPIRED');
  });

  it('HU15: desactivar responde 204, saca la historia de la bandeja, conserva la fila y audita', async () => {
    const ana = await signUp('ana');
    const story = await publish(ana);

    await deactivate(ana, story.id).expect(204);

    const res = await tray(ana).expect(200);
    expect(res.body.groups).toEqual([]);
    const row = await prisma.story.findUniqueOrThrow({
      where: { id: story.id },
    });
    expect(row.deactivatedAt).not.toBeNull();
    const audit = await prisma.auditLog.findFirst({
      where: { action: 'story.deactivate', entityId: story.id },
    });
    expect(audit).toMatchObject({ metadata: { by: 'self' } });
  });

  it('desactivar dos veces da 409 ALREADY_INACTIVE y una desactivada ya no se edita', async () => {
    const ana = await signUp('ana');
    const story = await publish(ana);
    await deactivate(ana, story.id).expect(204);

    const otra = await deactivate(ana, story.id).expect(409);
    const editar = await edit(ana, story.id, { text: 'Tarde' }).expect(409);

    expect(otra.body.code).toBe('ALREADY_INACTIVE');
    expect(editar.body.code).toBe('ALREADY_INACTIVE');
  });

  it('una historia que no existe responde 404 STORY_NOT_FOUND y un id mal formado, 400', async () => {
    const ana = await signUp('ana');

    const editar = await edit(ana, randomUUID(), { text: 'x' }).expect(404);
    const desactivar = await deactivate(ana, randomUUID()).expect(404);

    expect(editar.body.code).toBe('STORY_NOT_FOUND');
    expect(desactivar.body.code).toBe('STORY_NOT_FOUND');
    await edit(ana, 'no-es-uuid', { text: 'x' }).expect(400);
  });

  it('exige sesión', async () => {
    await request(server)
      .patch(`/api/v1/stories/${randomUUID()}`)
      .send({ text: 'x' })
      .expect(401);
    await request(server)
      .post(`/api/v1/stories/${randomUUID()}/deactivate`)
      .expect(401);
  });
});
