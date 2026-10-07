import type { AddressInfo } from 'node:net';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { io, type Socket } from 'socket.io-client';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { resetDb } from './support/reset-db.js';

// Conversaciones en tiempo real (spec 0008, decisión 25) contra PostgreSQL real
// y con un cliente de Socket.io de verdad.
const PASSWORD = 'clave-segura-2026';
const MISSING_ID = '01926f00-0000-7000-8000-000000000000';

interface Account {
  id: string;
  token: string;
}

interface MessageEvent {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
}

describe('Conversaciones (e2e)', () => {
  let app: NestExpressApplication;
  let server: App;
  let prisma: PrismaService;
  let baseUrl: string;
  let careerId: string;
  const sockets: Socket[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(app);
    // El socket necesita un puerto real; 0 deja que el sistema elija uno libre.
    await app.listen(0);
    server = app.getHttpServer();
    const { port } = app.getHttpServer().address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
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

  afterEach(() => {
    sockets.splice(0).forEach((s) => s.disconnect());
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

  const as = (account: Account) => ({
    get: (path: string) =>
      request(server)
        .get(`/api/v1${path}`)
        .set('Authorization', `Bearer ${account.token}`),
    post: (path: string, body: Record<string, unknown> = {}) =>
      request(server)
        .post(`/api/v1${path}`)
        .set('Authorization', `Bearer ${account.token}`)
        .send(body),
    patch: (path: string, body: Record<string, unknown> = {}) =>
      request(server)
        .patch(`/api/v1${path}`)
        .set('Authorization', `Bearer ${account.token}`)
        .send(body),
  });

  const open = async (from: Account, to: Account): Promise<string> =>
    (await as(from).post('/conversations', { userId: to.id }).expect(200)).body
      .id;

  const send = (from: Account, conversationId: string, content: string) =>
    as(from).post(`/conversations/${conversationId}/messages`, { content });

  const connect = (token?: string): Promise<Socket> =>
    new Promise((resolve, reject) => {
      const socket = io(baseUrl, {
        auth: token ? { token } : {},
        transports: ['websocket'],
        reconnection: false,
      });
      sockets.push(socket);
      socket.on('connect', () => resolve(socket));
      socket.on('connect_error', reject);
    });

  const nextEvent = <T>(socket: Socket, event: string): Promise<T> =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`no llegó ${event}`)),
        3000,
      );
      socket.once(event, (payload: T) => {
        clearTimeout(timer);
        resolve(payload);
      });
    });

  const nextMessage = (socket: Socket): Promise<MessageEvent> =>
    nextEvent<MessageEvent>(socket, 'message:new');

  it('AC-1 (HU34 E1, HU35 E1): un mensaje enviado llega al otro por el socket sin recargar', async () => {
    const ana = await signUp('ana');
    const beto = await signUp('beto');
    const conversationId = await open(ana, beto);
    const betoSocket = await connect(beto.token);
    const received = nextMessage(betoSocket);

    const res = await send(ana, conversationId, '  Hola Beto  ').expect(201);

    expect(res.body).toMatchObject({
      conversationId,
      senderId: ana.id,
      content: 'Hola Beto',
      editedAt: null,
    });
    const event = await received;
    expect(event).toEqual(res.body);
  });

  it('AC-1: el socket sin token o con un token inválido se rechaza', async () => {
    await expect(connect()).rejects.toMatchObject({
      message: 'UNAUTHORIZED',
    });
    await expect(connect('no-es-un-jwt')).rejects.toMatchObject({
      message: 'UNAUTHORIZED',
    });
  });

  it('AC-1: un tercero conectado no recibe mensajes de una conversación ajena', async () => {
    const ana = await signUp('ana');
    const beto = await signUp('beto');
    const carla = await signUp('carla');
    const conversationId = await open(ana, beto);
    const carlaSocket = await connect(carla.token);
    let leaked = false;
    carlaSocket.on('message:new', () => {
      leaked = true;
    });
    const betoSocket = await connect(beto.token);
    const received = nextMessage(betoSocket);

    await send(ana, conversationId, 'Solo para Beto').expect(201);
    await received;
    expect(leaked).toBe(false);
  });

  it('AC-2: abrir reusa la conversación del par, sin importar quién la abre', async () => {
    const ana = await signUp('ana');
    const beto = await signUp('beto');
    const first = await open(ana, beto);
    const second = await open(beto, ana);
    expect(second).toBe(first);
    expect(await prisma.conversation.count()).toBe(1);

    const res = await as(ana).get(`/conversations/${first}`).expect(200);
    expect(res.body).toMatchObject({
      id: first,
      otherUser: { id: beto.id, handle: 'beto', displayName: 'beto Prueba' },
      lastMessage: null,
      unread: false,
    });
    expect(JSON.stringify(res.body)).not.toContain('@est.intec.edu.do');
  });

  it('AC-2: no se abre conversación consigo mismo ni con una cuenta inexistente o desactivada', async () => {
    const ana = await signUp('ana');
    const beto = await signUp('beto');
    await prisma.user.update({
      where: { id: beto.id },
      data: { deactivatedAt: new Date() },
    });

    const self = await as(ana)
      .post('/conversations', { userId: ana.id })
      .expect(400);
    expect(self.body.code).toBe('CANNOT_MESSAGE_SELF');
    const missing = await as(ana)
      .post('/conversations', { userId: MISSING_ID })
      .expect(404);
    expect(missing.body.code).toBe('USER_NOT_FOUND');
    const inactive = await as(ana)
      .post('/conversations', { userId: beto.id })
      .expect(404);
    expect(inactive.body.code).toBe('USER_NOT_FOUND');
    await as(ana).post('/conversations', { userId: 'x' }).expect(400);
    expect(await prisma.conversation.count()).toBe(0);
  });

  it('AC-3 (HU34 E2): un mensaje vacío, largo o con campos extra no se envía', async () => {
    const ana = await signUp('ana');
    const beto = await signUp('beto');
    const conversationId = await open(ana, beto);

    const empty = await send(ana, conversationId, '   ').expect(400);
    expect(empty.body.code).toBe('MESSAGE_CONTENT_REQUIRED');
    for (const body of [
      {},
      { content: 'a'.repeat(2001) },
      { content: 'Hola', senderId: beto.id },
      { content: 42 },
    ]) {
      const res = await as(ana)
        .post(`/conversations/${conversationId}/messages`, body)
        .expect(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    }
    await send(ana, conversationId, 'é'.repeat(2000)).expect(201);
    expect(await prisma.message.count()).toBe(1);
  });

  it('AC-4: solo quien participa ve, lee o escribe en la conversación', async () => {
    const ana = await signUp('ana');
    const beto = await signUp('beto');
    const carla = await signUp('carla');
    const conversationId = await open(ana, beto);

    for (const res of [
      await as(carla).get(`/conversations/${conversationId}`),
      await as(carla).get(`/conversations/${conversationId}/messages`),
      await send(carla, conversationId, 'Me cuelo'),
      await as(carla).post(`/conversations/${conversationId}/read`),
      await as(ana).get(`/conversations/${MISSING_ID}`),
    ]) {
      expect(res.status).toBe(404);
      expect(res.body.code).toBe('CONVERSATION_NOT_FOUND');
    }
    expect(await prisma.message.count()).toBe(0);
  });

  it('AC-5 (HU33 E1): la bandeja se ordena por el último mensaje y marca lo no leído', async () => {
    const ana = await signUp('ana');
    const beto = await signUp('beto');
    const carla = await signUp('carla');
    const dani = await signUp('dani');
    const withBeto = await open(ana, beto);
    const withCarla = await open(ana, carla);
    await open(ana, dani); // sin mensajes: no sale en la bandeja

    await send(ana, withBeto, 'Hola Beto').expect(201);
    await send(carla, withCarla, 'Hola Ana, soy Carla').expect(201);
    await send(beto, withBeto, 'Hola Ana, soy Beto').expect(201);

    const inbox = await as(ana).get('/conversations').expect(200);
    expect(
      inbox.body.items.map(
        (c: { otherUser: { handle: string } }) => c.otherUser.handle,
      ),
    ).toEqual(['beto', 'carla']);
    expect(inbox.body.items[0]).toMatchObject({
      lastMessage: { senderId: beto.id, content: 'Hola Ana, soy Beto' },
      unread: true,
    });
    expect(inbox.body.nextCursor).toBeNull();

    // Quien envía no ve su propio mensaje como pendiente.
    const betoInbox = await as(beto).get('/conversations').expect(200);
    expect(betoInbox.body.items[0].unread).toBe(false);

    await as(ana).post(`/conversations/${withBeto}/read`).expect(204);
    const after = await as(ana).get('/conversations').expect(200);
    expect(after.body.items[0].unread).toBe(false);
    expect(after.body.items[1].unread).toBe(true);
  });

  it('AC-5 (HU33 E2): sin conversaciones con mensajes la bandeja viene vacía', async () => {
    const ana = await signUp('ana');
    const beto = await signUp('beto');
    await open(ana, beto);
    const res = await as(ana).get('/conversations').expect(200);
    expect(res.body).toEqual({ items: [], nextCursor: null });
  });

  it('AC-5: la bandeja oculta a quien desactivó su cuenta y pagina por cursor', async () => {
    const ana = await signUp('ana');
    const others = await Promise.all(
      ['b1', 'b2', 'b3'].map((h) => signUp(`usuario_${h}`)),
    );
    for (const other of others) {
      await send(other, await open(other, ana), 'hola').expect(201);
    }
    await prisma.user.update({
      where: { id: others[0].id },
      data: { deactivatedAt: new Date() },
    });

    const first = await as(ana).get('/conversations?limit=1').expect(200);
    expect(first.body.items[0].otherUser.handle).toBe('usuario_b3');
    const second = await as(ana)
      .get(`/conversations?limit=1&cursor=${first.body.nextCursor}`)
      .expect(200);
    expect(second.body.items[0].otherUser.handle).toBe('usuario_b2');
    expect(second.body.nextCursor).toBeNull();

    const bad = await as(ana)
      .get(`/conversations?cursor=${MISSING_ID}`)
      .expect(400);
    expect(bad.body.code).toBe('INVALID_CURSOR');
  });

  it('AC-6 (HU38 E1): el historial trae todos los mensajes, del más reciente al más antiguo, sin desactivados', async () => {
    const ana = await signUp('ana');
    const beto = await signUp('beto');
    const conversationId = await open(ana, beto);
    const base = Date.parse('2026-10-01T12:00:00Z');
    for (let i = 0; i < 25; i++) {
      await prisma.message.create({
        data: {
          conversationId,
          senderId: i % 2 === 0 ? ana.id : beto.id,
          content: `m${i}`,
          // Los mensajes 10 y 11 comparten el mismo instante.
          createdAt: new Date(base + (i === 11 ? 10 : i) * 1000),
        },
      });
    }
    await prisma.message.create({
      data: {
        conversationId,
        senderId: ana.id,
        content: 'retirado',
        deactivatedAt: new Date(),
      },
    });

    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const query: string = cursor ? `?cursor=${cursor}` : '';
      const res = await as(beto)
        .get(`/conversations/${conversationId}/messages${query}`)
        .expect(200);
      seen.push(...res.body.items.map((m: { content: string }) => m.content));
      cursor = res.body.nextCursor;
    } while (cursor);

    expect(seen).toHaveLength(25);
    expect(seen).not.toContain('retirado');
    expect(seen[0]).toBe('m24');
    expect(seen.at(-1)).toBe('m0');
  });

  // Funcionalidad 26: editar y desactivar mensajes (HU36, HU37).
  const messagePath = (conversationId: string, messageId: string) =>
    `/conversations/${conversationId}/messages/${messageId}`;

  it('26 AC-1 (HU36 E1): el autor edita su mensaje, queda marcado como editado y el otro lo ve sin recargar', async () => {
    const ana = await signUp('ana');
    const beto = await signUp('beto');
    const conversationId = await open(ana, beto);
    const sent = (await send(ana, conversationId, 'Hola Bteo').expect(201))
      .body;
    const betoSocket = await connect(beto.token);
    const updated = nextEvent<MessageEvent>(betoSocket, 'message:updated');

    const res = await as(ana)
      .patch(messagePath(conversationId, sent.id), { content: ' Hola Beto ' })
      .expect(200);

    expect(res.body).toMatchObject({
      id: sent.id,
      content: 'Hola Beto',
      createdAt: sent.createdAt,
    });
    expect(res.body.editedAt).not.toBeNull();
    expect(await updated).toEqual(res.body);
    const history = await as(beto)
      .get(`/conversations/${conversationId}/messages`)
      .expect(200);
    expect(history.body.items[0]).toEqual(res.body);
    const log = await prisma.auditLog.findMany({
      where: { action: 'message.update', entityId: sent.id },
    });
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ actorId: ana.id, succeeded: true });
  });

  it('26 AC-2 (HU36 E2, HU37 E2): nadie más que el autor edita o desactiva un mensaje', async () => {
    const ana = await signUp('ana');
    const beto = await signUp('beto');
    const carla = await signUp('carla');
    const conversationId = await open(ana, beto);
    const sent = (await send(ana, conversationId, 'Original').expect(201)).body;
    const path = messagePath(conversationId, sent.id);

    const edit = await as(beto)
      .patch(path, { content: 'Cambiado' })
      .expect(403);
    expect(edit.body.code).toBe('NOT_MESSAGE_AUTHOR');
    const off = await as(beto).post(`${path}/deactivate`).expect(403);
    expect(off.body.code).toBe('NOT_MESSAGE_AUTHOR');
    // Quien no participa no sabe ni que la conversación existe.
    await as(carla).patch(path, { content: 'Cambiado' }).expect(404);
    await as(carla).post(`${path}/deactivate`).expect(404);

    const row = await prisma.message.findUniqueOrThrow({
      where: { id: sent.id },
    });
    expect(row).toMatchObject({
      content: 'Original',
      editedAt: null,
      deactivatedAt: null,
    });
  });

  it('26 AC-3 (HU36): la edición vacía, larga o con campos extra se rechaza', async () => {
    const ana = await signUp('ana');
    const beto = await signUp('beto');
    const conversationId = await open(ana, beto);
    const sent = (await send(ana, conversationId, 'Original').expect(201)).body;
    const path = messagePath(conversationId, sent.id);

    const empty = await as(ana).patch(path, { content: '   ' }).expect(400);
    expect(empty.body.code).toBe('MESSAGE_CONTENT_REQUIRED');
    await as(ana)
      .patch(path, { content: 'x'.repeat(2001) })
      .expect(400);
    await as(ana)
      .patch(path, { content: 'Hola', senderId: beto.id })
      .expect(400);
    const missing = await as(ana)
      .patch(messagePath(conversationId, MISSING_ID), { content: 'Hola' })
      .expect(404);
    expect(missing.body.code).toBe('MESSAGE_NOT_FOUND');
  });

  it('26 AC-4 (HU37 E1): el autor desactiva su mensaje, sale de la vista de los dos al momento y se conserva para auditoría', async () => {
    const ana = await signUp('ana');
    const beto = await signUp('beto');
    const conversationId = await open(ana, beto);
    await send(ana, conversationId, 'Primero').expect(201);
    const sent = (await send(ana, conversationId, 'Me equivoqué').expect(201))
      .body;
    const betoSocket = await connect(beto.token);
    const removed = nextEvent<{ id: string; conversationId: string }>(
      betoSocket,
      'message:deactivated',
    );

    await as(ana)
      .post(`${messagePath(conversationId, sent.id)}/deactivate`)
      .expect(204);

    expect(await removed).toEqual({ id: sent.id, conversationId });
    const history = await as(beto)
      .get(`/conversations/${conversationId}/messages`)
      .expect(200);
    expect(history.body.items.map((m: MessageEvent) => m.content)).toEqual([
      'Primero',
    ]);
    // La bandeja muestra el mensaje activo anterior.
    const inbox = await as(beto).get('/conversations').expect(200);
    expect(inbox.body.items[0].lastMessage.content).toBe('Primero');
    const row = await prisma.message.findUniqueOrThrow({
      where: { id: sent.id },
    });
    expect(row.content).toBe('Me equivoqué');
    expect(row.deactivatedAt).not.toBeNull();
    const log = await prisma.auditLog.findMany({
      where: { action: 'message.deactivate', entityId: sent.id },
    });
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({
      actorId: ana.id,
      succeeded: true,
      metadata: { by: 'self' },
    });
  });

  it('26 AC-4: un mensaje desactivado no se desactiva otra vez ni se edita', async () => {
    const ana = await signUp('ana');
    const beto = await signUp('beto');
    const conversationId = await open(ana, beto);
    const sent = (await send(ana, conversationId, 'Adiós').expect(201)).body;
    const path = messagePath(conversationId, sent.id);
    await as(ana).post(`${path}/deactivate`).expect(204);

    const again = await as(ana).post(`${path}/deactivate`).expect(409);
    expect(again.body.code).toBe('ALREADY_INACTIVE');
    const edit = await as(ana).patch(path, { content: 'Hola' }).expect(404);
    expect(edit.body.code).toBe('MESSAGE_NOT_FOUND');
  });

  it('sin token todas las rutas de conversaciones responden 401', async () => {
    await request(server).get('/api/v1/conversations').expect(401);
    await request(server)
      .post('/api/v1/conversations')
      .send({ userId: MISSING_ID })
      .expect(401);
    await request(server)
      .get(`/api/v1/conversations/${MISSING_ID}/messages`)
      .expect(401);
    await request(server)
      .patch(`/api/v1/conversations/${MISSING_ID}/messages/${MISSING_ID}`)
      .send({ content: 'Hola' })
      .expect(401);
    await request(server)
      .post(
        `/api/v1/conversations/${MISSING_ID}/messages/${MISSING_ID}/deactivate`,
      )
      .expect(401);
  });
});
