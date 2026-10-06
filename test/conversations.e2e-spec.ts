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

  const nextMessage = (socket: Socket): Promise<MessageEvent> =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('no llegó message:new')),
        3000,
      );
      socket.once('message:new', (payload: MessageEvent) => {
        clearTimeout(timer);
        resolve(payload);
      });
    });

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

  it('sin token todas las rutas de conversaciones responden 401', async () => {
    await request(server).get('/api/v1/conversations').expect(401);
    await request(server)
      .post('/api/v1/conversations')
      .send({ userId: MISSING_ID })
      .expect(401);
    await request(server)
      .get(`/api/v1/conversations/${MISSING_ID}/messages`)
      .expect(401);
  });
});
