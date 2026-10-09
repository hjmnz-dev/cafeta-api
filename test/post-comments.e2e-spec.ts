import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { resetDb } from './support/reset-db.js';

// Comentarios en publicaciones (funcionalidad 21, HU21 a HU24) contra PostgreSQL real.
const PASSWORD = 'clave-segura-2026';

interface Account {
  id: string;
  token: string;
}

describe('Comentarios en publicaciones (e2e)', () => {
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

  const publish = async (account: Account): Promise<string> => {
    const res = await request(server)
      .post('/api/v1/posts')
      .set(auth(account))
      .send({ content: 'Resumen de cálculo' })
      .expect(201);
    return res.body.id as string;
  };

  const comment = (account: Account, postId: string, content: string) =>
    request(server)
      .post(`/api/v1/posts/${postId}/comments`)
      .set(auth(account))
      .send({ content });

  const list = (account: Account, postId: string, query = '') =>
    request(server)
      .get(`/api/v1/posts/${postId}/comments${query}`)
      .set(auth(account));

  const edit = (
    account: Account,
    postId: string,
    commentId: string,
    content: string,
  ) =>
    request(server)
      .patch(`/api/v1/posts/${postId}/comments/${commentId}`)
      .set(auth(account))
      .send({ content });

  const deactivate = (account: Account, postId: string, commentId: string) =>
    request(server)
      .post(`/api/v1/posts/${postId}/comments/${commentId}/deactivate`)
      .set(auth(account));

  const commentCount = async (account: Account, postId: string) => {
    const res = await request(server)
      .get(`/api/v1/users/${account.id}/posts`)
      .set(auth(account))
      .expect(200);
    return res.body.items.find((p: { id: string }) => p.id === postId)
      .commentCount as number;
  };

  const follow = (follower: Account, following: Account) =>
    prisma.follow.create({
      data: {
        followerId: follower.id,
        followingId: following.id,
        status: 'ACCEPTED',
      },
    });

  it('HU21: comentar responde 201 con el comentario recortado, mío y sin editar', async () => {
    const ana = await signUp('ana');
    const beto = await signUp('beto');
    const postId = await publish(ana);

    const res = await comment(
      beto,
      postId,
      '  Gracias por el resumen  ',
    ).expect(201);

    expect(res.body).toMatchObject({
      content: 'Gracias por el resumen',
      editedAt: null,
      isMine: true,
      author: { id: beto.id, handle: 'beto', displayName: 'beto Prueba' },
    });
    const row = await prisma.postComment.findUniqueOrThrow({
      where: { id: res.body.id },
    });
    expect(row).toMatchObject({ postId, authorId: beto.id });
  });

  it('el conteo de la tarjeta sube al comentar y baja al desactivar', async () => {
    const ana = await signUp('ana');
    const beto = await signUp('beto');
    const postId = await publish(ana);
    expect(await commentCount(ana, postId)).toBe(0);

    const uno = await comment(beto, postId, 'Uno').expect(201);
    await comment(beto, postId, 'Dos').expect(201);
    expect(await commentCount(ana, postId)).toBe(2);

    await deactivate(beto, postId, uno.body.id).expect(204);
    expect(await commentCount(ana, postId)).toBe(1);
  });

  it('HU22: la lista va del más antiguo al más nuevo, con cursor, y marca los míos', async () => {
    const ana = await signUp('ana');
    const beto = await signUp('beto');
    const postId = await publish(ana);
    const ids: string[] = [];
    for (const [i, who] of [beto, ana, beto].entries()) {
      const res = await comment(who, postId, `comentario ${i + 1}`).expect(201);
      ids.push(res.body.id);
    }

    const first = await list(ana, postId, '?limit=2').expect(200);
    expect(first.body.items.map((c: { id: string }) => c.id)).toEqual(
      ids.slice(0, 2),
    );
    expect(first.body.items.map((c: { isMine: boolean }) => c.isMine)).toEqual([
      false,
      true,
    ]);
    expect(first.body.nextCursor).toBe(ids[1]);

    const second = await list(
      ana,
      postId,
      `?limit=2&cursor=${first.body.nextCursor}`,
    ).expect(200);
    expect(second.body.items.map((c: { id: string }) => c.id)).toEqual([
      ids[2],
    ]);
    expect(second.body.nextCursor).toBeNull();

    const invalid = await list(ana, postId, `?cursor=${randomUUID()}`).expect(
      400,
    );
    expect(invalid.body.code).toBe('INVALID_CURSOR');
  });

  it('valida el texto: vacío, de más de 500 caracteres y campos de más', async () => {
    const ana = await signUp('ana');
    const postId = await publish(ana);

    const vacio = await comment(ana, postId, '   ').expect(400);
    expect(vacio.body.code).toBe('COMMENT_EMPTY');
    const largo = await comment(ana, postId, 'a'.repeat(501)).expect(400);
    expect(largo.body.code).toBe('COMMENT_TOO_LONG');
    await comment(ana, postId, 'a'.repeat(500)).expect(201);
    await comment(ana, postId, '😀'.repeat(500)).expect(201);
    await request(server)
      .post(`/api/v1/posts/${postId}/comments`)
      .set(auth(ana))
      .send({})
      .expect(400);
    await request(server)
      .post(`/api/v1/posts/${postId}/comments`)
      .set(auth(ana))
      .send({ content: 'ok', authorId: randomUUID() })
      .expect(400);
  });

  it('una publicación que no se ve responde 404 POST_NOT_FOUND al comentar y al listar', async () => {
    const ana = await signUp('ana');
    const beto = await signUp('beto');
    const archivada = await publish(ana);
    const desactivada = await publish(ana);
    await prisma.post.update({
      where: { id: archivada },
      data: { archivedAt: new Date() },
    });
    await prisma.post.update({
      where: { id: desactivada },
      data: { deactivatedAt: new Date() },
    });

    for (const id of [archivada, desactivada, randomUUID()]) {
      const crear = await comment(beto, id, 'Hola').expect(404);
      const leer = await list(beto, id).expect(404);
      expect(crear.body.code).toBe('POST_NOT_FOUND');
      expect(leer.body.code).toBe('POST_NOT_FOUND');
    }
    await list(beto, 'no-es-uuid').expect(400);
  });

  it('si el autor solo deja ver su contenido a seguidores, quien no lo sigue recibe 404', async () => {
    const ana = await signUp('ana');
    const beto = await signUp('beto');
    const postId = await publish(ana);
    await request(server)
      .patch('/api/v1/me/privacy')
      .set(auth(ana))
      .send({ visibility: 'FOLLOWERS' })
      .expect(200);

    await comment(beto, postId, 'Hola').expect(404);
    await list(beto, postId).expect(404);

    await follow(beto, ana);
    await comment(beto, postId, 'Hola').expect(201);
    await list(beto, postId).expect(200);
  });

  it('la lista oculta los comentarios de cuentas desactivadas y de personas bloqueadas', async () => {
    const ana = await signUp('ana');
    const beto = await signUp('beto');
    const carla = await signUp('carla');
    const dani = await signUp('dani');
    const postId = await publish(ana);
    await comment(beto, postId, 'de beto').expect(201);
    await comment(carla, postId, 'de carla').expect(201);
    await comment(dani, postId, 'de dani').expect(201);
    await prisma.user.update({
      where: { id: carla.id },
      data: { deactivatedAt: new Date() },
    });
    await prisma.block.create({
      data: { blockerId: ana.id, blockedId: dani.id },
    });

    const res = await list(ana, postId).expect(200);

    expect(res.body.items.map((c: { content: string }) => c.content)).toEqual([
      'de beto',
    ]);
  });

  it('HU23: editar cambia el texto y marca editedAt; el autor de la publicación no puede editar el de otro', async () => {
    const ana = await signUp('ana');
    const beto = await signUp('beto');
    const postId = await publish(ana);
    const created = await comment(beto, postId, 'Original').expect(201);

    const ajeno = await edit(ana, postId, created.body.id, 'Hackeado').expect(
      403,
    );
    expect(ajeno.body.code).toBe('NOT_COMMENT_AUTHOR');

    const res = await edit(
      beto,
      postId,
      created.body.id,
      '  Corregido  ',
    ).expect(200);
    expect(res.body).toMatchObject({
      id: created.body.id,
      content: 'Corregido',
      isMine: true,
    });
    expect(res.body.editedAt).not.toBeNull();
    const vacio = await edit(beto, postId, created.body.id, ' ').expect(400);
    expect(vacio.body.code).toBe('COMMENT_EMPTY');
  });

  it('HU24: desactivar responde 204, lo saca de la lista y conserva la fila', async () => {
    const ana = await signUp('ana');
    const beto = await signUp('beto');
    const postId = await publish(ana);
    const created = await comment(beto, postId, 'Se va').expect(201);

    const ajeno = await deactivate(ana, postId, created.body.id).expect(403);
    expect(ajeno.body.code).toBe('NOT_COMMENT_AUTHOR');
    await deactivate(beto, postId, created.body.id).expect(204);

    const res = await list(ana, postId).expect(200);
    expect(res.body.items).toEqual([]);
    const row = await prisma.postComment.findUniqueOrThrow({
      where: { id: created.body.id },
    });
    expect(row.deactivatedAt).not.toBeNull();
  });

  it('uno ya desactivado responde 409 ALREADY_INACTIVE al repetir y al editar', async () => {
    const ana = await signUp('ana');
    const postId = await publish(ana);
    const created = await comment(ana, postId, 'Uno').expect(201);
    await deactivate(ana, postId, created.body.id).expect(204);

    const otra = await deactivate(ana, postId, created.body.id).expect(409);
    const editar = await edit(ana, postId, created.body.id, 'Tarde').expect(
      409,
    );

    expect(otra.body.code).toBe('ALREADY_INACTIVE');
    expect(editar.body.code).toBe('ALREADY_INACTIVE');
  });

  it('un comentario que no existe o que es de otra publicación responde 404 COMMENT_NOT_FOUND', async () => {
    const ana = await signUp('ana');
    const uno = await publish(ana);
    const dos = await publish(ana);
    const created = await comment(ana, uno, 'Uno').expect(201);

    const inexistente = await edit(ana, uno, randomUUID(), 'x').expect(404);
    const ajeno = await deactivate(ana, dos, created.body.id).expect(404);

    expect(inexistente.body.code).toBe('COMMENT_NOT_FOUND');
    expect(ajeno.body.code).toBe('COMMENT_NOT_FOUND');
  });

  it('audita crear, editar y desactivar con el actor y el id del comentario', async () => {
    const ana = await signUp('ana');
    const beto = await signUp('beto');
    const postId = await publish(ana);
    const created = await comment(beto, postId, 'Uno').expect(201);
    await edit(beto, postId, created.body.id, 'Dos').expect(200);
    await deactivate(beto, postId, created.body.id).expect(204);

    const rows = await prisma.auditLog.findMany({
      where: { entityId: created.body.id },
      orderBy: { createdAt: 'asc' },
    });

    expect(rows.map((r) => r.action)).toEqual([
      'post_comment.create',
      'post_comment.update',
      'post_comment.deactivate',
    ]);
    expect(rows.every((r) => r.actorId === beto.id)).toBe(true);
    expect(rows.every((r) => r.entityType === 'post_comment')).toBe(true);
  });

  it('avisa al autor de la publicación (POST_COMMENT) y no a quien comenta en la suya', async () => {
    const ana = await signUp('ana');
    const beto = await signUp('beto');
    const postId = await publish(ana);

    await comment(ana, postId, 'Yo mismo').expect(201);
    expect(await prisma.notification.count()).toBe(0);

    await comment(beto, postId, 'Gracias').expect(201);
    const rows = await prisma.notification.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      recipientId: ana.id,
      actorId: beto.id,
      type: 'POST_COMMENT',
      postId,
    });
  });

  it('exige sesión en las cuatro rutas', async () => {
    const id = randomUUID();
    const base = `/api/v1/posts/${id}/comments`;
    await request(server).get(base).expect(401);
    await request(server).post(base).send({ content: 'x' }).expect(401);
    await request(server)
      .patch(`${base}/${id}`)
      .send({ content: 'x' })
      .expect(401);
    await request(server).post(`${base}/${id}/deactivate`).expect(401);
  });
});
