import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { resetDb } from './support/reset-db.js';

const PASSWORD = 'clave-segura-2026';

interface Account {
  id: string;
  token: string;
}

describe('Bloquear y desbloquear (e2e)', () => {
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

  const authGet = (account: Account, path: string) =>
    request(server)
      .get(`/api/v1${path}`)
      .set('Authorization', `Bearer ${account.token}`);

  const authPost = (account: Account, path: string, body: unknown = {}) =>
    request(server)
      .post(`/api/v1${path}`)
      .set('Authorization', `Bearer ${account.token}`)
      .set('User-Agent', 'cafeta-e2e')
      .send(body as Record<string, unknown>);

  const authDelete = (account: Account, path: string) =>
    request(server)
      .delete(`/api/v1${path}`)
      .set('Authorization', `Bearer ${account.token}`)
      .set('User-Agent', 'cafeta-e2e');

  it('HU53 E1: rechaza bloquearse a sí mismo o a un usuario inexistente', async () => {
    const me = await signUp('estudiante_a');

    const selfRes = await authPost(me, `/users/${me.id}/block`).expect(400);
    expect(selfRes.body.code).toBe('CANNOT_BLOCK_SELF');

    const fakeId = '00000000-0000-7000-8000-000000000000';
    const fakeRes = await authPost(me, `/users/${fakeId}/block`).expect(404);
    expect(fakeRes.body.code).toBe('USER_NOT_FOUND');
  });

  it('HU53 E1: bloquear desactiva seguimientos en ambos sentidos y es idempotente', async () => {
    const a = await signUp('usuario_a');
    const b = await signUp('usuario_b');

    // A sigue a B y B sigue a A
    await authPost(a, `/users/${b.id}/follow`).expect(201);
    await authPost(b, `/users/${a.id}/follow`).expect(201);

    const followsBefore = await prisma.follow.findMany({
      where: { deactivatedAt: null },
    });
    expect(followsBefore).toHaveLength(2);

    // A bloquea a B
    const blockRes = await authPost(a, `/users/${b.id}/block`).expect(200);
    expect(blockRes.body.blocked).toBe(true);
    expect(blockRes.body.blockedAt).toBeDefined();

    // Seguimientos cortados en ambas direcciones
    const followsAfter = await prisma.follow.findMany({
      where: { deactivatedAt: null },
    });
    expect(followsAfter).toHaveLength(0);

    // Auditoría registrada
    const auditLog = await prisma.auditLog.findFirst({
      where: { action: 'block.create' },
    });
    expect(auditLog).not.toBeNull();
    expect(auditLog?.actorId).toBe(a.id);

    // Idempotencia: segundo bloqueo responde 200 sin duplicar fila ni fallar
    const blockAgain = await authPost(a, `/users/${b.id}/block`).expect(200);
    expect(blockAgain.body.blocked).toBe(true);

    const blocksCount = await prisma.block.count();
    expect(blocksCount).toBe(1);
  });

  it('HU53 E2: el bloqueo oculta perfil, feed y conversaciones en ambas direcciones', async () => {
    const a = await signUp('bloqueador');
    const b = await signUp('bloqueado');

    // Publicación de B y de A
    await authPost(b, '/posts', { content: 'Post público de B' }).expect(201);
    await authPost(a, '/posts', { content: 'Post público de A' }).expect(201);

    // Conversación previa con mensaje
    const convRes = await authPost(a, '/conversations', {
      userId: b.id,
    }).expect(201);
    const convId = convRes.body.id;
    await authPost(a, `/conversations/${convId}/messages`, {
      content: 'Hola B',
    }).expect(201);

    // Confirmamos que antes del bloqueo ambos ven la conversación en su bandeja
    const inboxABefore = await authGet(a, '/conversations').expect(200);
    const inboxBBefore = await authGet(b, '/conversations').expect(200);
    expect(inboxABefore.body.items).toHaveLength(1);
    expect(inboxBBefore.body.items).toHaveLength(1);

    // A bloquea a B
    await authPost(a, `/users/${b.id}/block`).expect(200);

    // 1. Perfil: responde 404 USER_NOT_FOUND en ambas direcciones
    const profileOfBforA = await authGet(a, `/users/${b.id}/profile`).expect(
      404,
    );
    expect(profileOfBforA.body.code).toBe('USER_NOT_FOUND');

    const profileOfAforB = await authGet(b, `/users/${a.id}/profile`).expect(
      404,
    );
    expect(profileOfAforB.body.code).toBe('USER_NOT_FOUND');

    // 2. Feed: ninguno ve publicaciones del otro
    const feedA = await authGet(a, '/posts/feed').expect(200);
    expect(
      feedA.body.items.some((p: { content: string }) =>
        p.content.includes('Post público de B'),
      ),
    ).toBe(false);

    const feedB = await authGet(b, '/posts/feed').expect(200);
    expect(
      feedB.body.items.some((p: { content: string }) =>
        p.content.includes('Post público de A'),
      ),
    ).toBe(false);

    // 3. Mensajería:
    // La conversación desaparece de la bandeja para los dos
    const inboxAAfter = await authGet(a, '/conversations').expect(200);
    const inboxBAfter = await authGet(b, '/conversations').expect(200);
    expect(inboxAAfter.body.items).toHaveLength(0);
    expect(inboxBAfter.body.items).toHaveLength(0);

    // Intentar abrir conversación falla con 404 USER_NOT_FOUND
    const openRes = await authPost(b, '/conversations', {
      userId: a.id,
    }).expect(404);
    expect(openRes.body.code).toBe('USER_NOT_FOUND');

    // Intentar enviar mensaje en la conversación existente responde 404
    const sendRes = await authPost(b, `/conversations/${convId}/messages`, {
      content: 'Sigues ahí?',
    }).expect(404);
    expect(sendRes.body.code).toBe('CONVERSATION_NOT_FOUND');
  });

  it('HU54 E1: listar bloqueados y desbloquear restablece visibilidad sin restaurar seguimientos', async () => {
    const a = await signUp('persona_a');
    const b = await signUp('persona_b');

    // A sigue a B
    await authPost(a, `/users/${b.id}/follow`).expect(201);

    // A bloquea a B
    await authPost(a, `/users/${b.id}/block`).expect(200);

    // A ve a B en su lista de bloqueados
    const listA = await authGet(a, '/blocks').expect(200);
    expect(listA.body.items).toHaveLength(1);
    expect(listA.body.items[0].id).toBe(b.id);
    expect(listA.body.items[0].handle).toBe('persona_b');

    // B NO ve a A en sus bloqueados
    const listB = await authGet(b, '/blocks').expect(200);
    expect(listB.body.items).toHaveLength(0);

    // A desbloquea a B
    await authDelete(a, `/users/${b.id}/block`).expect(204);

    // Lista de bloqueados queda vacía
    const listAAfter = await authGet(a, '/blocks').expect(200);
    expect(listAAfter.body.items).toHaveLength(0);

    // Auditoría de desbloqueo
    const auditLog = await prisma.auditLog.findFirst({
      where: { action: 'block.deactivate' },
    });
    expect(auditLog).not.toBeNull();
    expect(auditLog?.actorId).toBe(a.id);

    // El perfil de B vuelve a ser visible para A
    const profileB = await authGet(a, `/users/${b.id}/profile`).expect(200);
    expect(profileB.body.handle).toBe('persona_b');

    // Los seguimientos NO se restauran solos (decisión 29)
    const follows = await prisma.follow.findMany({
      where: { followerId: a.id, followingId: b.id, deactivatedAt: null },
    });
    expect(follows).toHaveLength(0);

    // Intentar desbloquear de nuevo da 404 BLOCK_NOT_FOUND
    const unblockAgain = await authDelete(a, `/users/${b.id}/block`).expect(
      404,
    );
    expect(unblockAgain.body.code).toBe('BLOCK_NOT_FOUND');
  });
});
