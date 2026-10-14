import { useAcceptance, type Account } from './support/acceptance.js';

// Aceptación de FT07 (mensajería), FT08 (notificaciones) y FT09 (búsqueda y
// descubrimiento): HU33 a HU42. Un escenario Gherkin por prueba, con su id en
// el nombre (spec 0008, decisión 37).
const ctx = useAcceptance();

interface Message {
  id: string;
  content: string;
  editedAt: string | null;
}

const openConversation = async (from: Account, to: Account) =>
  (await ctx.as(from).post('/conversations', { userId: to.id }).expect(200))
    .body.id as string;

const send = (from: Account, conversationId: string, content: string) =>
  ctx.as(from).post(`/conversations/${conversationId}/messages`, { content });

const history = async (viewer: Account, conversationId: string) =>
  (
    await ctx
      .as(viewer)
      .get(`/conversations/${conversationId}/messages`)
      .expect(200)
  ).body.items as Message[];

const inbox = async (viewer: Account) =>
  (await ctx.as(viewer).get('/conversations').expect(200)).body.items as {
    id: string;
  }[];

const notificationTypes = async (viewer: Account) =>
  (await ctx.as(viewer).get('/notifications').expect(200)).body.items.map(
    (n: { type: string }) => n.type,
  ) as string[];

describe('HU33 Ver bandeja de mensajes', () => {
  it('HU33 E1: la bandeja lista mis conversaciones por actividad reciente', async () => {
    const ana = await ctx.signUp('ana');
    const beto = await ctx.signUp('beto');
    const carla = await ctx.signUp('carla');
    const conBeto = await openConversation(ana, beto);
    const conCarla = await openConversation(ana, carla);
    await send(ana, conBeto, 'Hola Beto').expect(201);
    await send(ana, conCarla, 'Hola Carla').expect(201);

    expect((await inbox(ana)).map((c) => c.id)).toEqual([conCarla, conBeto]);

    await send(beto, conBeto, 'Respuesta').expect(201);

    expect((await inbox(ana)).map((c) => c.id)).toEqual([conBeto, conCarla]);
  });

  it('HU33 E2: sin conversaciones iniciadas la bandeja viene vacía', async () => {
    const ana = await ctx.signUp('ana');

    expect(await inbox(ana)).toEqual([]);
  });
});

describe('HU34 Enviar mensaje', () => {
  it('HU34 E1: el mensaje se entrega al destinatario y queda en el historial de la conversación', async () => {
    const ana = await ctx.signUp('ana');
    const beto = await ctx.signUp('beto');
    const conversationId = await openConversation(ana, beto);

    const res = await send(ana, conversationId, '  Hola Beto  ').expect(201);

    expect(res.body.content).toBe('Hola Beto');
    expect((await history(beto, conversationId)).map((m) => m.content)).toEqual(
      ['Hola Beto'],
    );
    expect((await history(ana, conversationId)).map((m) => m.content)).toEqual([
      'Hola Beto',
    ]);
  });

  it('HU34 E2: un mensaje vacío no se envía', async () => {
    const ana = await ctx.signUp('ana');
    const beto = await ctx.signUp('beto');
    const conversationId = await openConversation(ana, beto);

    await send(ana, conversationId, '   ').expect(400);

    expect(await history(ana, conversationId)).toEqual([]);
    expect(await ctx.prisma.message.count()).toBe(0);
  });
});

describe('HU35 Recibir mensaje', () => {
  it('HU35 E1: el mensaje aparece en mi conversación y genera una notificación según mis preferencias', async () => {
    const ana = await ctx.signUp('ana');
    const beto = await ctx.signUp('beto');
    const carla = await ctx.signUp('carla');
    // Beto apaga los avisos de mensajes; Carla los deja encendidos.
    await ctx
      .as(beto)
      .patch('/notifications/preferences', { messages: false })
      .expect(200);

    const conBeto = await openConversation(ana, beto);
    const conCarla = await openConversation(ana, carla);
    await send(ana, conBeto, 'Hola Beto').expect(201);
    await send(ana, conCarla, 'Hola Carla').expect(201);

    // El mensaje llega a la conversación de los dos, pero solo avisa a quien lo quiere.
    expect((await inbox(beto)).map((c) => c.id)).toEqual([conBeto]);
    expect((await inbox(carla)).map((c) => c.id)).toEqual([conCarla]);
    expect(await notificationTypes(carla)).toEqual(['MESSAGE']);
    expect(await notificationTypes(beto)).toEqual([]);
  });
});

describe('HU36 Editar mensaje', () => {
  it('HU36 E1: el autor edita su mensaje y queda marcado como editado', async () => {
    const ana = await ctx.signUp('ana');
    const beto = await ctx.signUp('beto');
    const conversationId = await openConversation(ana, beto);
    const sent = await send(ana, conversationId, 'antes').expect(201);

    const res = await ctx
      .as(ana)
      .patch(`/conversations/${conversationId}/messages/${sent.body.id}`, {
        content: 'después',
      })
      .expect(200);

    expect(res.body.content).toBe('después');
    expect(res.body.editedAt).not.toBeNull();
    const [seenByBeto] = await history(beto, conversationId);
    expect(seenByBeto).toMatchObject({ content: 'después' });
    expect(seenByBeto.editedAt).not.toBeNull();
  });

  it('HU36 E2: quien no escribió el mensaje no puede editarlo', async () => {
    const ana = await ctx.signUp('ana');
    const beto = await ctx.signUp('beto');
    const conversationId = await openConversation(ana, beto);
    const sent = await send(ana, conversationId, 'mío').expect(201);

    const res = await ctx
      .as(beto)
      .patch(`/conversations/${conversationId}/messages/${sent.body.id}`, {
        content: 'ajeno',
      })
      .expect(403);

    expect(res.body.code).toBe('NOT_MESSAGE_AUTHOR');
    expect((await history(ana, conversationId))[0].content).toBe('mío');
  });
});

describe('HU37 Desactivar mensaje', () => {
  it('HU37 E1: el autor desactiva su mensaje, sale de la conversación y se conserva para auditoría', async () => {
    const ana = await ctx.signUp('ana');
    const beto = await ctx.signUp('beto');
    const conversationId = await openConversation(ana, beto);
    const sent = await send(ana, conversationId, 'bórralo').expect(201);

    await ctx
      .as(ana)
      .post(
        `/conversations/${conversationId}/messages/${sent.body.id}/deactivate`,
      )
      .expect(204);

    expect(await history(ana, conversationId)).toEqual([]);
    expect(await history(beto, conversationId)).toEqual([]);
    const row = await ctx.prisma.message.findUniqueOrThrow({
      where: { id: sent.body.id },
    });
    expect(row.deactivatedAt).not.toBeNull();
    expect(
      await ctx.prisma.auditLog.count({
        where: { action: 'message.deactivate', entityId: sent.body.id },
      }),
    ).toBe(1);
  });

  it('HU37 E2: quien no escribió el mensaje no puede desactivarlo', async () => {
    const ana = await ctx.signUp('ana');
    const beto = await ctx.signUp('beto');
    const conversationId = await openConversation(ana, beto);
    const sent = await send(ana, conversationId, 'mío').expect(201);

    const res = await ctx
      .as(beto)
      .post(
        `/conversations/${conversationId}/messages/${sent.body.id}/deactivate`,
      )
      .expect(403);

    expect(res.body.code).toBe('NOT_MESSAGE_AUTHOR');
    expect(await history(ana, conversationId)).toHaveLength(1);
  });
});

describe('HU38 Ver conversación', () => {
  it('HU38 E1: abrir la conversación muestra el historial completo de mensajes de los dos', async () => {
    const ana = await ctx.signUp('ana');
    const beto = await ctx.signUp('beto');
    const conversationId = await openConversation(ana, beto);
    await send(ana, conversationId, 'uno').expect(201);
    await send(beto, conversationId, 'dos').expect(201);
    await send(ana, conversationId, 'tres').expect(201);

    const messages = await history(ana, conversationId);

    // La API los entrega del más reciente al más antiguo; la pantalla los invierte.
    expect(messages.map((m) => m.content)).toEqual(['tres', 'dos', 'uno']);
  });
});

describe('HU39 Ver notificaciones', () => {
  it('HU39 E1: los eventos de mi cuenta se listan del más reciente al más antiguo', async () => {
    const ana = await ctx.signUp('ana');
    const beto = await ctx.signUp('beto');
    const postId = await ctx.publish(ana, 'hola');
    await ctx.as(beto).post(`/users/${ana.id}/follow`).expect(201);
    await ctx
      .as(beto)
      .put(`/posts/${postId}/reaction`, { type: 'HEART' })
      .expect(200);
    await ctx
      .as(beto)
      .post(`/posts/${postId}/comments`, { content: 'Buena' })
      .expect(201);

    expect(await notificationTypes(ana)).toEqual([
      'POST_COMMENT',
      'POST_REACTION',
      'FOLLOW',
    ]);
  });

  it('HU39 E2: sin eventos nuevos la lista viene vacía y el conteo en cero', async () => {
    const ana = await ctx.signUp('ana');

    expect(await notificationTypes(ana)).toEqual([]);
    const count = await ctx
      .as(ana)
      .get('/notifications/unread-count')
      .expect(200);
    expect(count.body).toEqual({ count: 0 });
  });
});

describe('HU40 Explorar contenido', () => {
  it('HU40 E1: explorar muestra publicaciones de otros usuarios y no las mías', async () => {
    const ana = await ctx.signUp('ana');
    const beto = await ctx.signUp('beto');
    await ctx.publish(beto, 'de Beto');
    await ctx.publish(ana, 'mía');

    const res = await ctx.as(ana).get('/explore/posts').expect(200);

    expect(res.body.items.map((p: { content: string }) => p.content)).toEqual([
      'de Beto',
    ]);
  });

  it('HU40 E2: sin contenido nuevo que recomendar la lista viene vacía', async () => {
    const ana = await ctx.signUp('ana');
    await ctx.publish(ana, 'solo hay lo mío');

    const res = await ctx.as(ana).get('/explore/posts').expect(200);

    expect(res.body.items).toEqual([]);
  });
});

describe('HU41 Buscar usuarios', () => {
  it('HU41 E1: buscar el nombre de un usuario existente muestra su perfil', async () => {
    const ana = await ctx.signUp('ana');
    await ctx.signUp('beto');

    const res = await ctx.as(ana).get('/search/users?q=beto').expect(200);

    expect(res.body.items.map((u: { handle: string }) => u.handle)).toEqual([
      'beto',
    ]);
  });

  it('HU41 E2: un nombre sin coincidencias devuelve una lista vacía', async () => {
    const ana = await ctx.signUp('ana');

    const res = await ctx.as(ana).get('/search/users?q=zzzzqq').expect(200);

    expect(res.body.items).toEqual([]);
  });
});

describe('HU42 Buscar contenido', () => {
  it('HU42 E1: buscar una palabra clave muestra las publicaciones relacionadas', async () => {
    const ana = await ctx.signUp('ana');
    const beto = await ctx.signUp('beto');
    await ctx.publish(beto, 'Repaso de álgebra lineal');
    await ctx.publish(beto, 'Receta de sancocho');

    const res = await ctx.as(ana).get('/search/posts?q=algebra').expect(200);

    expect(res.body.items.map((p: { content: string }) => p.content)).toEqual([
      'Repaso de álgebra lineal',
    ]);
  });

  it('HU42 E2: una palabra sin coincidencias devuelve una lista vacía', async () => {
    const ana = await ctx.signUp('ana');
    await ctx.publish(ana, 'algo');

    const res = await ctx.as(ana).get('/search/posts?q=zzzzqq').expect(200);

    expect(res.body.items).toEqual([]);
  });
});
