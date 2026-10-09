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

// Notificaciones y preferencias (spec 0008, decisión 27; HU39 y HU08) contra
// PostgreSQL real y con un cliente de Socket.io de verdad.
const PASSWORD = 'clave-segura-2026';
const MISSING_ID = '01926f00-0000-7000-8000-000000000000';

interface Account {
  id: string;
  token: string;
}

interface NotificationEvent {
  id: string;
  type: string;
  actor: { id: string; handle: string; displayName: string } | null;
  conversationId: string | null;
  read: boolean;
}

describe('Notificaciones (e2e)', () => {
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

  const as = (account: Account) => {
    const auth = { Authorization: `Bearer ${account.token}` };
    return {
      get: (path: string) => request(server).get(`/api/v1${path}`).set(auth),
      post: (path: string, body: Record<string, unknown> = {}) =>
        request(server).post(`/api/v1${path}`).set(auth).send(body),
      patch: (path: string, body: Record<string, unknown> = {}) =>
        request(server).patch(`/api/v1${path}`).set(auth).send(body),
    };
  };

  const sendMessage = async (from: Account, to: Account, content: string) => {
    const conversation = await as(from)
      .post('/conversations', { userId: to.id })
      .expect(200);
    await as(from)
      .post(`/conversations/${conversation.body.id}/messages`, { content })
      .expect(201);
    return conversation.body.id as string;
  };

  const connect = (token: string): Promise<Socket> =>
    new Promise((resolve, reject) => {
      const socket = io(baseUrl, {
        auth: { token },
        transports: ['websocket'],
        reconnection: false,
      });
      sockets.push(socket);
      socket.on('connect', () => resolve(socket));
      socket.on('connect_error', reject);
    });

  const nextNotification = (socket: Socket): Promise<NotificationEvent> =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('no llegó notification:new')),
        3000,
      );
      socket.once('notification:new', (payload: NotificationEvent) => {
        clearTimeout(timer);
        resolve(payload);
      });
    });

  const typesOf = async (account: Account): Promise<string[]> => {
    const res = await as(account).get('/notifications').expect(200);
    return res.body.items.map((n: NotificationEvent) => n.type);
  };

  it('AC-1: un mensaje genera su aviso y llega al momento por el socket', async () => {
    const ana = await signUp('ana');
    const beto = await signUp('beto');
    const betoSocket = await connect(beto.token);
    const received = nextNotification(betoSocket);

    const conversationId = await sendMessage(ana, beto, 'Hola');

    const event = await received;
    expect(event).toMatchObject({
      type: 'MESSAGE',
      actor: { id: ana.id, handle: 'ana' },
      conversationId,
      read: false,
    });
    const list = await as(beto).get('/notifications').expect(200);
    expect(list.body.items).toEqual([event]);
    // Quien actúa no se avisa a sí mismo.
    expect(await typesOf(ana)).toEqual([]);
  });

  it('AC-1: seguir a un perfil público avisa FOLLOW; a uno limitado, FOLLOW_REQUEST; aceptar avisa FOLLOW_ACCEPTED', async () => {
    const ana = await signUp('ana');
    const beto = await signUp('beto');
    const carla = await signUp('carla');
    await as(carla)
      .patch('/me/privacy', { visibility: 'FOLLOWERS' })
      .expect(200);

    await as(ana).post(`/users/${beto.id}/follow`).expect(201);
    const request_ = await as(ana)
      .post(`/users/${carla.id}/follow`)
      .expect(201);
    await as(carla).post(`/follows/${request_.body.id}/accept`).expect(204);

    expect(await typesOf(beto)).toEqual(['FOLLOW']);
    expect(await typesOf(carla)).toEqual(['FOLLOW_REQUEST']);
    expect(await typesOf(ana)).toEqual(['FOLLOW_ACCEPTED']);
  });

  it('AC-1: pasar a público acepta las solicitudes y avisa a cada seguidor', async () => {
    const ana = await signUp('ana');
    const carla = await signUp('carla');
    await as(carla)
      .patch('/me/privacy', { visibility: 'FOLLOWERS' })
      .expect(200);
    await as(ana).post(`/users/${carla.id}/follow`).expect(201);

    await as(carla).patch('/me/privacy', { visibility: 'PUBLIC' }).expect(200);

    expect(await typesOf(ana)).toEqual(['FOLLOW_ACCEPTED']);
  });

  it('AC-2 (HU39 E1): la lista va del más reciente al más antiguo y pagina por cursor', async () => {
    const ana = await signUp('ana');
    const beto = await signUp('beto');
    const base = Date.parse('2026-10-01T12:00:00Z');
    for (let i = 0; i < 25; i++) {
      await prisma.notification.create({
        data: {
          recipientId: beto.id,
          actorId: ana.id,
          type: 'FOLLOW',
          // Las 10 y 11 comparten el mismo instante.
          createdAt: new Date(base + (i === 11 ? 10 : i) * 1000),
        },
      });
    }

    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const query: string = cursor ? `?cursor=${cursor}&limit=10` : '?limit=10';
      const res = await as(beto).get(`/notifications${query}`).expect(200);
      seen.push(...res.body.items.map((n: { id: string }) => n.id));
      cursor = res.body.nextCursor;
    } while (cursor);

    expect(new Set(seen).size).toBe(25);
    const rows = await prisma.notification.findMany({
      where: { recipientId: beto.id },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    expect(seen).toEqual(rows.map((r) => r.id));
    const bad = await as(beto)
      .get(`/notifications?cursor=${MISSING_ID}`)
      .expect(400);
    expect(bad.body.code).toBe('INVALID_CURSOR');
  });

  it('AC-3 (HU39 E2): sin avisos la lista viene vacía y el conteo en cero', async () => {
    const ana = await signUp('ana');

    const list = await as(ana).get('/notifications').expect(200);
    expect(list.body).toEqual({ items: [], nextCursor: null });
    const count = await as(ana).get('/notifications/unread-count').expect(200);
    expect(count.body).toEqual({ count: 0 });
  });

  it('AC-4: marcar una o todas como leídas baja el conteo; nadie marca las de otro', async () => {
    const ana = await signUp('ana');
    const beto = await signUp('beto');
    await sendMessage(ana, beto, 'Uno');
    await sendMessage(ana, beto, 'Dos');
    await sendMessage(ana, beto, 'Tres');
    const items = (await as(beto).get('/notifications').expect(200)).body
      .items as NotificationEvent[];
    expect(
      (await as(beto).get('/notifications/unread-count').expect(200)).body,
    ).toEqual({ count: 3 });

    await as(beto).post(`/notifications/${items[0].id}/read`).expect(204);
    // Repetir no es error.
    await as(beto).post(`/notifications/${items[0].id}/read`).expect(204);
    expect(
      (await as(beto).get('/notifications/unread-count').expect(200)).body,
    ).toEqual({ count: 2 });
    const after = await as(beto).get('/notifications').expect(200);
    expect(after.body.items[0].read).toBe(true);

    const foreign = await as(ana)
      .post(`/notifications/${items[1].id}/read`)
      .expect(404);
    expect(foreign.body.code).toBe('NOTIFICATION_NOT_FOUND');

    await as(beto).post('/notifications/read-all').expect(204);
    expect(
      (await as(beto).get('/notifications/unread-count').expect(200)).body,
    ).toEqual({ count: 0 });
  });

  it('AC-5 (HU08 E1): apagar un tipo deja de generar ese tipo sin afectar los demás', async () => {
    const ana = await signUp('ana');
    const beto = await signUp('beto');
    const defaults = await as(beto)
      .get('/notifications/preferences')
      .expect(200);
    expect(defaults.body).toEqual({
      reactions: true,
      comments: true,
      follows: true,
      messages: true,
      stories: true,
    });

    const saved = await as(beto)
      .patch('/notifications/preferences', { messages: false })
      .expect(200);
    expect(saved.body).toMatchObject({ messages: false, follows: true });

    await sendMessage(ana, beto, 'No debería avisar');
    await as(ana).post(`/users/${beto.id}/follow`).expect(201);
    expect(await typesOf(beto)).toEqual(['FOLLOW']);

    await as(beto)
      .patch('/notifications/preferences', { messages: 'no' })
      .expect(400);
    await as(beto)
      .patch('/notifications/preferences', { email: true })
      .expect(400);
  });

  it('AC-6: no hay aviso entre dos personas con un bloqueo, y los de una cuenta desactivada dejan de salir', async () => {
    const ana = await signUp('ana');
    const beto = await signUp('beto');
    const carla = await signUp('carla');
    await sendMessage(carla, beto, 'Hola Beto');
    await prisma.block.create({
      data: { blockerId: beto.id, blockedId: ana.id },
    });

    // La conversación se crea directo en la base; con el bloqueo (29), enviar
    // en ella responde 404 y por eso no se genera ningún aviso.
    const conversation = await prisma.conversation.create({
      data:
        ana.id < beto.id
          ? { userAId: ana.id, userBId: beto.id }
          : { userAId: beto.id, userBId: ana.id },
    });
    await as(ana)
      .post(`/conversations/${conversation.id}/messages`, { content: 'Hola' })
      .expect(404);
    expect(await typesOf(beto)).toEqual(['MESSAGE']);

    await prisma.user.update({
      where: { id: carla.id },
      data: { deactivatedAt: new Date() },
    });
    expect(await typesOf(beto)).toEqual([]);
  });

  it('sin token todas las rutas de notificaciones responden 401', async () => {
    await request(server).get('/api/v1/notifications').expect(401);
    await request(server).get('/api/v1/notifications/unread-count').expect(401);
    await request(server).post('/api/v1/notifications/read-all').expect(401);
    await request(server)
      .post(`/api/v1/notifications/${MISSING_ID}/read`)
      .expect(401);
    await request(server).get('/api/v1/notifications/preferences').expect(401);
    await request(server)
      .patch('/api/v1/notifications/preferences')
      .send({ messages: false })
      .expect(401);
  });
});
