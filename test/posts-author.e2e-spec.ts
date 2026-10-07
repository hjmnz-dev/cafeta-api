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

// Gestionar mis publicaciones (spec 0008, decisión 17; HU20, HU22, HU23).
const PASSWORD = 'clave-segura-2026';
const PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d,
]);

interface Account {
  id: string;
  token: string;
}

describe('Gestionar mis publicaciones (e2e)', () => {
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

  const call = (
    account: Account,
    method: 'post' | 'patch' | 'delete' | 'get',
    path: string,
  ) =>
    request(server)
      [method](`/api/v1${path}`)
      .set('Authorization', `Bearer ${account.token}`)
      .set('User-Agent', 'cafeta-e2e');

  const publish = async (account: Account, body: Record<string, unknown>) =>
    (await call(account, 'post', '/posts').send(body).expect(201)).body as {
      id: string;
    };

  const uploadPng = async (account: Account) =>
    (
      await call(account, 'post', '/uploads')
        .attach('file', PNG, 'foto.png')
        .expect(201)
    ).body as { key: string };

  const feedIds = async (account: Account) =>
    (await call(account, 'get', '/posts/feed').expect(200)).body.items.map(
      (p: { id: string }) => p.id,
    );

  const audits = (action: string) =>
    prisma.auditLog.findMany({ where: { action } });

  it('HU20 E2: con un adjunto el texto es opcional; sin texto ni adjuntos se rechaza', async () => {
    const ana = await signUp('ana');
    const { key } = await uploadPng(ana);

    const post = await publish(ana, { mediaKeys: [key] });
    expect(post).toMatchObject({ content: null });

    const res = await call(ana, 'post', '/posts').send({}).expect(400);
    expect(res.body.code).toBe('POST_CONTENT_REQUIRED');
  });

  it('HU22 E1: editar cambia el texto, marca editado, conserva interacciones y audita post.update', async () => {
    const ana = await signUp('ana');
    const beto = await signUp('beto');
    const post = await publish(ana, { content: 'Primera versión' });
    await prisma.postReaction.create({
      data: { postId: post.id, userId: beto.id, type: 'HEART' },
    });
    await prisma.postComment.create({
      data: { postId: post.id, authorId: beto.id, content: 'Buena' },
    });

    const res = await call(ana, 'patch', `/posts/${post.id}`)
      .send({ content: '  Versión corregida  ', location: 'Biblioteca' })
      .expect(200);

    expect(res.body).toMatchObject({
      id: post.id,
      content: 'Versión corregida',
      location: 'Biblioteca',
      reactionCount: 1,
      commentCount: 1,
    });
    expect(res.body.editedAt).not.toBeNull();
    expect(await audits('post.update')).toHaveLength(1);
  });

  it('editar conserva los adjuntos y deja vaciar el texto solo si hay adjuntos', async () => {
    const ana = await signUp('ana');
    const { key } = await uploadPng(ana);
    const conFoto = await publish(ana, {
      content: 'Con foto',
      mediaKeys: [key],
    });
    const soloTexto = await publish(ana, { content: 'Solo texto' });

    const res = await call(ana, 'patch', `/posts/${conFoto.id}`)
      .send({ content: '' })
      .expect(200);
    expect(res.body.content).toBeNull();
    expect(res.body.media).toHaveLength(1);

    const vacia = await call(ana, 'patch', `/posts/${soloTexto.id}`)
      .send({ content: '   ' })
      .expect(400);
    expect(vacia.body.code).toBe('POST_CONTENT_REQUIRED');
  });

  it('un campo de otro tipo se rechaza con POST_FIELD_NOT_ALLOWED', async () => {
    const ana = await signUp('ana');
    const post = await publish(ana, { content: 'Texto' });

    const res = await call(ana, 'patch', `/posts/${post.id}`)
      .send({ codeSnippet: 'let x = 1' })
      .expect(400);
    expect(res.body.code).toBe('POST_FIELD_NOT_ALLOWED');
  });

  it('HU22 E2 y HU23 E2: nadie más que el autor edita, desactiva o elimina, y queda access.denied', async () => {
    const ana = await signUp('ana');
    const beto = await signUp('beto');
    const post = await publish(ana, { content: 'De Ana' });

    for (const [method, path, body] of [
      ['patch', `/posts/${post.id}`, { content: 'hackeada' }],
      ['post', `/posts/${post.id}/deactivate`, undefined],
      ['delete', `/posts/${post.id}`, undefined],
    ] as const) {
      const res = await call(beto, method, path).send(body).expect(403);
      expect(res.body.code).toBe('NOT_POST_AUTHOR');
    }

    const intact = await prisma.post.findUniqueOrThrow({
      where: { id: post.id },
    });
    expect(intact).toMatchObject({ content: 'De Ana', deactivatedAt: null });
    expect(await audits('access.denied')).toHaveLength(3);
  });

  it('una publicación que no existe responde POST_NOT_FOUND', async () => {
    const ana = await signUp('ana');
    const res = await call(
      ana,
      'patch',
      '/posts/01926f00-0000-7000-8000-000000000999',
    )
      .send({ content: 'x' })
      .expect(404);
    expect(res.body.code).toBe('POST_NOT_FOUND');
  });

  it('HU23 E1: desactivar la retira del feed y del perfil, la conserva y audita; reactivar la devuelve', async () => {
    const ana = await signUp('ana');
    const post = await publish(ana, { content: 'Se va' });

    await call(ana, 'post', `/posts/${post.id}/deactivate`).expect(204);

    expect(await feedIds(ana)).not.toContain(post.id);
    const perfil = await call(ana, 'get', `/users/${ana.id}/posts`).expect(200);
    expect(perfil.body.items).toHaveLength(0);
    const row = await prisma.post.findUniqueOrThrow({ where: { id: post.id } });
    expect(row.deactivatedAt).not.toBeNull();
    expect(await audits('post.deactivate')).toHaveLength(1);

    const otra = await call(ana, 'post', `/posts/${post.id}/deactivate`).expect(
      409,
    );
    expect(otra.body.code).toBe('ALREADY_INACTIVE');
    const editar = await call(ana, 'patch', `/posts/${post.id}`)
      .send({ content: 'x' })
      .expect(409);
    expect(editar.body.code).toBe('POST_INACTIVE');

    await call(ana, 'post', `/posts/${post.id}/reactivate`).expect(204);
    expect(await feedIds(ana)).toContain(post.id);
    expect(await audits('post.reactivate')).toHaveLength(1);
  });

  it('eliminar borra de verdad la publicación, sus interacciones y sus archivos, y audita post.delete', async () => {
    const ana = await signUp('ana');
    const beto = await signUp('beto');
    const { key } = await uploadPng(ana);
    const post = await publish(ana, { content: 'Adiós', mediaKeys: [key] });
    await prisma.postReaction.create({
      data: { postId: post.id, userId: beto.id, type: 'FIRE' },
    });
    await prisma.postComment.create({
      data: { postId: post.id, authorId: beto.id, content: 'Nooo' },
    });

    await call(ana, 'delete', `/posts/${post.id}`).expect(204);

    expect(await prisma.post.count()).toBe(0);
    expect(await prisma.postMedia.count()).toBe(0);
    expect(await prisma.postReaction.count()).toBe(0);
    expect(await prisma.postComment.count()).toBe(0);
    expect(storage.objects.has(key)).toBe(false);
    const [audit] = await audits('post.delete');
    expect(audit).toMatchObject({ entityId: post.id, actorId: ana.id });
    await call(ana, 'delete', `/posts/${post.id}`).expect(404);
  });
});
