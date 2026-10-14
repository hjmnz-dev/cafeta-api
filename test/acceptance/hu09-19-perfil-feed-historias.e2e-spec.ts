import { PDF, useAcceptance, type Account } from './support/acceptance.js';

// Aceptación de FT02 (perfil), FT03 (feed) y FT04 (historias): HU09 a HU19. Un
// escenario Gherkin por prueba, con su id en el nombre (spec 0008, decisión 37).
const ctx = useAcceptance();
const HOUR_MS = 60 * 60 * 1000;

interface StoryCard {
  id: string;
  text: string | null;
  myReaction: string | null;
  reactionCount: number | null;
  editedAt: string | null;
}
interface Group {
  author: { handle: string };
  stories: StoryCard[];
}

const tray = async (account: Account): Promise<Group[]> => {
  const res = await ctx.as(account).get('/stories').expect(200);
  return res.body.groups as Group[];
};

const storyCard = async (
  viewer: Account,
  storyId: string,
): Promise<StoryCard | undefined> =>
  (await tray(viewer)).flatMap((g) => g.stories).find((s) => s.id === storyId);

const expire = (storyId: string) =>
  ctx.prisma.story.update({
    where: { id: storyId },
    data: { expiresAt: new Date(Date.now() - 1000) },
  });

describe('HU09 Ver perfil de usuario', () => {
  it('HU09 E1: el perfil público de otro usuario muestra su información, su actividad y las opciones de interacción', async () => {
    const ana = await ctx.signUp('ana');
    const beto = await ctx.signUp('beto');
    await ctx
      .as(beto)
      .patch('/me/profile', { bio: 'Estudio ingeniería' })
      .expect(200);
    await ctx.publish(beto, 'mi primera publicación');

    const profile = await ctx
      .as(ana)
      .get(`/users/${beto.id}/profile`)
      .expect(200);
    const posts = await ctx.as(ana).get(`/users/${beto.id}/posts`).expect(200);

    expect(profile.body).toMatchObject({
      handle: 'beto',
      bio: 'Estudio ingeniería',
      canSeeContent: true,
      canFollow: true,
    });
    expect(posts.body.items.map((p: { content: string }) => p.content)).toEqual(
      ['mi primera publicación'],
    );
  });

  it('HU09 E2: con privacidad "Solo seguidores" y sin seguirlo, el perfil sale limitado y sin la información restringida', async () => {
    const ana = await ctx.signUp('ana');
    const beto = await ctx.signUp('beto');
    await ctx
      .as(beto)
      .patch('/me/profile', {
        bio: 'Solo para seguidores',
        location: 'Santo Domingo',
      })
      .expect(200);
    await ctx.publish(beto, 'restringida');
    await ctx
      .as(beto)
      .patch('/me/privacy', { visibility: 'FOLLOWERS' })
      .expect(200);

    const profile = await ctx
      .as(ana)
      .get(`/users/${beto.id}/profile`)
      .expect(200);
    const posts = await ctx.as(ana).get(`/users/${beto.id}/posts`).expect(403);

    expect(profile.body).toMatchObject({
      handle: 'beto',
      canSeeContent: false,
      bio: null,
      location: null,
    });
    expect(posts.body.code).toBe('PROFILE_RESTRICTED');
  });
});

describe('HU10 Editar perfil', () => {
  it('HU10 E1: modificar nombre, biografía y carrera se guarda y el perfil público lo refleja', async () => {
    const ana = await ctx.signUp('ana');
    const beto = await ctx.signUp('beto');
    const otherCareer = await ctx.prisma.career.create({
      data: { name: 'Medicina' },
    });

    const saved = await ctx
      .as(ana)
      .patch('/me/profile', {
        displayName: 'Ana María',
        bio: 'Me gusta programar',
        careerId: otherCareer.id,
      })
      .expect(200);

    expect(saved.body).toMatchObject({
      displayName: 'Ana María',
      bio: 'Me gusta programar',
      careerName: 'Medicina',
    });
    const seen = await ctx.as(beto).get(`/users/${ana.id}/profile`).expect(200);
    expect(seen.body).toMatchObject({
      displayName: 'Ana María',
      bio: 'Me gusta programar',
      careerName: 'Medicina',
    });
  });

  it('HU10 E2: dejar vacío un campo obligatorio rechaza el guardado y no cambia nada', async () => {
    const ana = await ctx.signUp('ana');

    const res = await ctx.as(ana).patch('/me/profile', { displayName: '   ' });

    expect(res.status).toBe(400);
    const profile = await ctx
      .as(ana)
      .get(`/users/${ana.id}/profile`)
      .expect(200);
    expect(profile.body.displayName).toBe('ana Prueba');
  });
});

describe('HU11 Ver feed principal', () => {
  it('HU11 E1: el feed trae las publicaciones de quien sigo, de la más reciente a la más antigua', async () => {
    const ana = await ctx.signUp('ana');
    const beto = await ctx.signUp('beto');
    await ctx.follow(ana, beto);
    await ctx.publish(beto, 'primera');
    await ctx.publish(beto, 'segunda');
    await ctx.publish(beto, 'tercera');

    const feed = await ctx.as(ana).get('/posts/feed').expect(200);

    expect(feed.body.items.map((p: { content: string }) => p.content)).toEqual([
      'tercera',
      'segunda',
      'primera',
    ]);
  });

  it('HU11 E2: sin seguir a nadie y sin publicaciones el feed viene vacío', async () => {
    const ana = await ctx.signUp('ana');
    const beto = await ctx.signUp('beto');
    await ctx.publish(beto, 'de alguien a quien no sigo');

    const feed = await ctx.as(ana).get('/posts/feed').expect(200);

    expect(feed.body.items).toEqual([]);
    expect(feed.body.nextCursor).toBeNull();
  });
});

describe('HU12 Crear Historias', () => {
  it('HU12 E1: publicar una imagen con texto la hace visible a mis seguidores con vigencia de 24 horas', async () => {
    const ana = await ctx.signUp('ana');
    const beto = await ctx.signUp('beto');
    await ctx.follow(beto, ana);

    const storyId = await ctx.publishStory(ana, 'Hoy en el campus');

    const card = await storyCard(beto, storyId);
    expect(card).toMatchObject({ text: 'Hoy en el campus' });
    const row = await ctx.prisma.story.findUniqueOrThrow({
      where: { id: storyId },
    });
    expect(row.expiresAt.getTime() - row.createdAt.getTime()).toBe(
      24 * HOUR_MS,
    );
  });

  it('HU12 E2: un formato no soportado se rechaza con un código que lo indica', async () => {
    const ana = await ctx.signUp('ana');
    const pdfKey = await ctx.upload(ana, PDF, 'tesis.pdf');

    const res = await ctx
      .as(ana)
      .post('/stories', { mediaKey: pdfKey })
      .expect(400);

    expect(res.body.code).toBe('STORY_MEDIA_INVALID');
    expect(await ctx.prisma.story.count()).toBe(0);
  });
});

describe('HU13 Visualizar Historias', () => {
  it('HU13 E1: la historia vigente de quien sigo aparece entre las que puedo ver', async () => {
    const ana = await ctx.signUp('ana');
    const beto = await ctx.signUp('beto');
    await ctx.follow(beto, ana);
    const storyId = await ctx.publishStory(ana, 'vigente');

    expect(await storyCard(beto, storyId)).toMatchObject({ text: 'vigente' });
  });

  it('HU13 E2: una historia vencida ya no aparece', async () => {
    const ana = await ctx.signUp('ana');
    const beto = await ctx.signUp('beto');
    await ctx.follow(beto, ana);
    const storyId = await ctx.publishStory(ana, 'vencida');
    await expire(storyId);

    expect(await storyCard(beto, storyId)).toBeUndefined();
    expect(await tray(beto)).toEqual([]);
  });
});

describe('HU14 Editar historia', () => {
  it('HU14 E1: editar una historia vigente cambia el texto y mantiene su vigencia original', async () => {
    const ana = await ctx.signUp('ana');
    const storyId = await ctx.publishStory(ana, 'antes');
    const before = await ctx.prisma.story.findUniqueOrThrow({
      where: { id: storyId },
    });

    const res = await ctx
      .as(ana)
      .patch(`/stories/${storyId}`, { text: 'después' });

    expect(res.status).toBe(200);
    expect(res.body.text).toBe('después');
    expect(res.body.editedAt).not.toBeNull();
    expect(res.body.expiresAt).toBe(before.expiresAt.toISOString());
  });

  it('HU14 E2: una historia que ya expiró no se edita y la respuesta dice que ya no está vigente', async () => {
    const ana = await ctx.signUp('ana');
    const storyId = await ctx.publishStory(ana, 'antes');
    await expire(storyId);

    const res = await ctx
      .as(ana)
      .patch(`/stories/${storyId}`, { text: 'tarde' })
      .expect(409);

    expect(res.body.code).toBe('STORY_EXPIRED');
    const row = await ctx.prisma.story.findUniqueOrThrow({
      where: { id: storyId },
    });
    expect(row.text).toBe('antes');
  });
});

describe('HU15 Desactivar historia', () => {
  it('HU15 E1: el autor la desactiva, sale de la vista pública y queda su registro para auditoría', async () => {
    const ana = await ctx.signUp('ana');
    const beto = await ctx.signUp('beto');
    await ctx.follow(beto, ana);
    const storyId = await ctx.publishStory(ana);

    await ctx.as(ana).post(`/stories/${storyId}/deactivate`).expect(204);

    expect(await storyCard(beto, storyId)).toBeUndefined();
    const row = await ctx.prisma.story.findUniqueOrThrow({
      where: { id: storyId },
    });
    expect(row.deactivatedAt).not.toBeNull();
    expect(
      await ctx.prisma.auditLog.count({
        where: { action: 'story.deactivate', entityId: storyId },
      }),
    ).toBe(1);
  });

  it('HU15 E2: quien no es autor no puede desactivar la historia y nada cambia', async () => {
    const ana = await ctx.signUp('ana');
    const beto = await ctx.signUp('beto');
    await ctx.follow(beto, ana);
    const storyId = await ctx.publishStory(ana);

    const res = await ctx
      .as(beto)
      .post(`/stories/${storyId}/deactivate`)
      .expect(403);

    expect(res.body.code).toBe('NOT_STORY_AUTHOR');
    expect(await storyCard(ana, storyId)).toBeDefined();
  });
});

describe('HU16 Reaccionar a historia', () => {
  it('HU16 E1: reaccionar queda registrado y el autor ve el conteo', async () => {
    const ana = await ctx.signUp('ana');
    const beto = await ctx.signUp('beto');
    await ctx.follow(beto, ana);
    const storyId = await ctx.publishStory(ana);

    const res = await ctx
      .as(beto)
      .put(`/stories/${storyId}/reaction`, { type: 'FIRE' })
      .expect(200);

    expect(res.body.myReaction).toBe('FIRE');
    expect(await storyCard(ana, storyId)).toMatchObject({ reactionCount: 1 });
  });

  it('HU16 E2: elegir otra reacción reemplaza la anterior sin duplicar el conteo', async () => {
    const ana = await ctx.signUp('ana');
    const beto = await ctx.signUp('beto');
    await ctx.follow(beto, ana);
    const storyId = await ctx.publishStory(ana);
    await ctx
      .as(beto)
      .put(`/stories/${storyId}/reaction`, { type: 'HEART' })
      .expect(200);

    const changed = await ctx
      .as(beto)
      .put(`/stories/${storyId}/reaction`, { type: 'WOW' })
      .expect(200);

    expect(changed.body.myReaction).toBe('WOW');
    expect(await storyCard(ana, storyId)).toMatchObject({ reactionCount: 1 });
    expect(await ctx.prisma.storyReaction.count({ where: { storyId } })).toBe(
      1,
    );
  });
});

describe('HU17 Comentar historia', () => {
  it('HU17 E1: un comentario sobre una historia vigente se publica y lo ve el autor', async () => {
    const ana = await ctx.signUp('ana');
    const beto = await ctx.signUp('beto');
    const storyId = await ctx.publishStory(ana);

    const created = await ctx
      .as(beto)
      .post(`/stories/${storyId}/comments`, { content: 'Qué buena foto' })
      .expect(201);

    expect(created.body).toMatchObject({
      content: 'Qué buena foto',
      isMine: true,
    });
    const list = await ctx
      .as(ana)
      .get(`/stories/${storyId}/comments`)
      .expect(200);
    expect(list.body.items.map((c: { content: string }) => c.content)).toEqual([
      'Qué buena foto',
    ]);
  });

  it('HU17 E2: un comentario vacío no se envía y dice que no puede estar vacío', async () => {
    const ana = await ctx.signUp('ana');
    const storyId = await ctx.publishStory(ana);

    const res = await ctx
      .as(ana)
      .post(`/stories/${storyId}/comments`, { content: '   ' })
      .expect(400);

    expect(res.body.code).toBe('COMMENT_EMPTY');
    expect(await ctx.prisma.storyComment.count()).toBe(0);
  });
});

describe('HU18 Editar comentario de historia', () => {
  it('HU18 E1: el autor edita su comentario y se muestra con la nueva redacción', async () => {
    const ana = await ctx.signUp('ana');
    const beto = await ctx.signUp('beto');
    const storyId = await ctx.publishStory(ana);
    const comment = await ctx
      .as(beto)
      .post(`/stories/${storyId}/comments`, { content: 'antes' })
      .expect(201);

    const edited = await ctx
      .as(beto)
      .patch(`/stories/${storyId}/comments/${comment.body.id}`, {
        content: 'después',
      })
      .expect(200);

    expect(edited.body.content).toBe('después');
    expect(edited.body.editedAt).not.toBeNull();
  });

  it('HU18 E2: quien no escribió el comentario no puede editarlo', async () => {
    const ana = await ctx.signUp('ana');
    const beto = await ctx.signUp('beto');
    const storyId = await ctx.publishStory(ana);
    const comment = await ctx
      .as(beto)
      .post(`/stories/${storyId}/comments`, { content: 'mío' })
      .expect(201);

    const res = await ctx
      .as(ana)
      .patch(`/stories/${storyId}/comments/${comment.body.id}`, {
        content: 'ajeno',
      })
      .expect(403);

    expect(res.body.code).toBe('NOT_COMMENT_AUTHOR');
  });
});

describe('HU19 Desactivar comentario de historia', () => {
  it('HU19 E1: el autor desactiva su comentario, sale de la vista y se conserva para auditoría', async () => {
    const ana = await ctx.signUp('ana');
    const beto = await ctx.signUp('beto');
    const storyId = await ctx.publishStory(ana);
    const comment = await ctx
      .as(beto)
      .post(`/stories/${storyId}/comments`, { content: 'bórralo' })
      .expect(201);

    await ctx
      .as(beto)
      .post(`/stories/${storyId}/comments/${comment.body.id}/deactivate`)
      .expect(204);

    const list = await ctx
      .as(ana)
      .get(`/stories/${storyId}/comments`)
      .expect(200);
    expect(list.body.items).toEqual([]);
    const row = await ctx.prisma.storyComment.findUniqueOrThrow({
      where: { id: comment.body.id },
    });
    expect(row.deactivatedAt).not.toBeNull();
    expect(
      await ctx.prisma.auditLog.count({
        where: {
          action: 'story_comment.deactivate',
          entityId: comment.body.id,
        },
      }),
    ).toBe(1);
  });

  it('HU19 E2: quien no escribió el comentario no puede desactivarlo', async () => {
    const ana = await ctx.signUp('ana');
    const beto = await ctx.signUp('beto');
    const storyId = await ctx.publishStory(ana);
    const comment = await ctx
      .as(beto)
      .post(`/stories/${storyId}/comments`, { content: 'mío' })
      .expect(201);

    const res = await ctx
      .as(ana)
      .post(`/stories/${storyId}/comments/${comment.body.id}/deactivate`)
      .expect(403);

    expect(res.body.code).toBe('NOT_COMMENT_AUTHOR');
    const list = await ctx
      .as(beto)
      .get(`/stories/${storyId}/comments`)
      .expect(200);
    expect(list.body.items).toHaveLength(1);
  });
});
