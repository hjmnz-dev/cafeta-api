import { PNG, useAcceptance, type Account } from './support/acceptance.js';

// Aceptación de FT05 (publicaciones) y FT06 (interacciones sociales): HU20 a
// HU32. Un escenario Gherkin por prueba, con su id en el nombre (spec 0008,
// decisión 37). Nota: en project-context.md los escenarios de HU24 y HU25
// describen anuncios y guardados, aunque sus títulos digan comentar y
// reaccionar; las pruebas siguen los escenarios.
const ctx = useAcceptance();

interface PostItem {
  id: string;
  content: string;
}

const feedOf = async (account: Account): Promise<string[]> => {
  const res = await ctx.as(account).get('/posts/feed').expect(200);
  return res.body.items.map((p: PostItem) => p.content);
};

const profilePosts = async (viewer: Account, owner: Account) => {
  const res = await ctx.as(viewer).get(`/users/${owner.id}/posts`).expect(200);
  return res.body.items.map((p: PostItem) => p.content) as string[];
};

describe('HU20 Crear publicación', () => {
  it('HU20 E1: publicar con texto y un adjunto la muestra en mi perfil y en el feed de mis seguidores', async () => {
    const ana = await ctx.signUp('ana');
    const beto = await ctx.signUp('beto');
    await ctx.follow(beto, ana);
    const mediaKey = await ctx.upload(ana, PNG, 'foto.png');

    const res = await ctx
      .as(ana)
      .post('/posts', {
        content: 'Mi primera publicación',
        mediaKeys: [mediaKey],
      })
      .expect(201);

    expect(res.body.media).toHaveLength(1);
    expect(await profilePosts(ana, ana)).toEqual(['Mi primera publicación']);
    expect(await feedOf(beto)).toEqual(['Mi primera publicación']);
  });

  it('HU20 E2: publicar sin texto ni adjuntos se rechaza y dice que debe incluir contenido', async () => {
    const ana = await ctx.signUp('ana');

    const res = await ctx
      .as(ana)
      .post('/posts', { content: '   ' })
      .expect(400);

    expect(res.body.code).toBe('POST_CONTENT_REQUIRED');
    expect(await ctx.prisma.post.count()).toBe(0);
  });
});

describe('HU21 Archivar publicación', () => {
  it('HU21 E1: archivar la oculta de mi perfil público y la pasa a mis archivadas', async () => {
    const ana = await ctx.signUp('ana');
    const beto = await ctx.signUp('beto');
    const postId = await ctx.publish(ana, 'para archivar');

    await ctx.as(ana).post(`/posts/${postId}/archive`).expect(204);

    expect(await profilePosts(beto, ana)).toEqual([]);
    const archived = await ctx.as(ana).get('/posts/archived').expect(200);
    expect(archived.body.items.map((p: PostItem) => p.id)).toEqual([postId]);
  });

  it('HU21 E2: restaurar una publicación archivada la vuelve a mostrar en mi perfil', async () => {
    const ana = await ctx.signUp('ana');
    const beto = await ctx.signUp('beto');
    const postId = await ctx.publish(ana, 'vuelve');
    await ctx.as(ana).post(`/posts/${postId}/archive`).expect(204);

    await ctx.as(ana).post(`/posts/${postId}/restore`).expect(204);

    expect(await profilePosts(beto, ana)).toEqual(['vuelve']);
    const archived = await ctx.as(ana).get('/posts/archived').expect(200);
    expect(archived.body.items).toEqual([]);
  });
});

describe('HU22 Editar publicaciones', () => {
  it('HU22 E1: el autor edita el texto y se conservan las interacciones previas', async () => {
    const ana = await ctx.signUp('ana');
    const beto = await ctx.signUp('beto');
    const postId = await ctx.publish(ana, 'antes');
    await ctx
      .as(beto)
      .put(`/posts/${postId}/reaction`, { type: 'HEART' })
      .expect(200);
    await ctx
      .as(beto)
      .post(`/posts/${postId}/comments`, { content: 'Buena' })
      .expect(201);

    const res = await ctx
      .as(ana)
      .patch(`/posts/${postId}`, { content: 'después' });

    expect(res.status).toBe(200);
    expect(res.body.content).toBe('después');
    expect(res.body.editedAt).not.toBeNull();
    expect(await ctx.prisma.postReaction.count({ where: { postId } })).toBe(1);
    expect(await ctx.prisma.postComment.count({ where: { postId } })).toBe(1);
  });

  it('HU22 E2: quien no es autor no puede editar la publicación', async () => {
    const ana = await ctx.signUp('ana');
    const beto = await ctx.signUp('beto');
    const postId = await ctx.publish(ana, 'mía');

    const res = await ctx
      .as(beto)
      .patch(`/posts/${postId}`, { content: 'robada' })
      .expect(403);

    expect(res.body.code).toBe('NOT_POST_AUTHOR');
    const row = await ctx.prisma.post.findUniqueOrThrow({
      where: { id: postId },
    });
    expect(row.content).toBe('mía');
  });
});

describe('HU23 Desactivar publicación', () => {
  it('HU23 E1: el autor la desactiva, sale de la vista pública y queda su registro para auditoría', async () => {
    const ana = await ctx.signUp('ana');
    const beto = await ctx.signUp('beto');
    await ctx.follow(beto, ana);
    const postId = await ctx.publish(ana, 'adiós');

    await ctx.as(ana).post(`/posts/${postId}/deactivate`).expect(204);

    expect(await feedOf(beto)).toEqual([]);
    expect(await profilePosts(beto, ana)).toEqual([]);
    const row = await ctx.prisma.post.findUniqueOrThrow({
      where: { id: postId },
    });
    expect(row.deactivatedAt).not.toBeNull();
    expect(
      await ctx.prisma.auditLog.count({
        where: { action: 'post.deactivate', entityId: postId },
      }),
    ).toBe(1);
  });

  it('HU23 E2: quien no es autor no puede desactivar la publicación', async () => {
    const ana = await ctx.signUp('ana');
    const beto = await ctx.signUp('beto');
    const postId = await ctx.publish(ana, 'mía');

    const res = await ctx
      .as(beto)
      .post(`/posts/${postId}/deactivate`)
      .expect(403);

    expect(res.body.code).toBe('NOT_POST_AUTHOR');
    const row = await ctx.prisma.post.findUniqueOrThrow({
      where: { id: postId },
    });
    expect(row.deactivatedAt).toBeNull();
  });
});

describe('HU24 (escenarios de anuncios institucionales)', () => {
  it('HU24 E1: un administrador publica un anuncio que llega a toda la comunidad como contenido oficial', async () => {
    const admin = await ctx.signUpAdmin('admin');
    const ana = await ctx.signUp('ana');

    const res = await ctx
      .as(admin)
      .post('/admin/announcements', { content: 'Matrícula abierta' })
      .expect(201);

    expect(res.body.type).toBe('ANNOUNCEMENT');
    // Ana no sigue al admin y aun así lo ve, marcado como anuncio.
    const feed = await ctx.as(ana).get('/posts/feed').expect(200);
    expect(feed.body.items).toHaveLength(1);
    expect(feed.body.items[0]).toMatchObject({
      content: 'Matrícula abierta',
      type: 'ANNOUNCEMENT',
    });
  });

  it('HU24 E2: un estudiante sin permisos administrativos no puede publicar un anuncio', async () => {
    const ana = await ctx.signUp('ana');

    const res = await ctx
      .as(ana)
      .post('/admin/announcements', { content: 'Falso aviso' })
      .expect(403);

    expect(res.body.code).toBe('FORBIDDEN');
    expect(await ctx.prisma.post.count()).toBe(0);
  });
});

describe('HU25 (escenarios de guardar publicaciones)', () => {
  it('HU25 E1: guardar una publicación ajena la agrega a mi lista de guardados', async () => {
    const ana = await ctx.signUp('ana');
    const beto = await ctx.signUp('beto');
    const postId = await ctx.publish(ana, 'guárdala');

    await ctx.as(beto).put(`/posts/${postId}/save`).expect(204);

    const saved = await ctx.as(beto).get('/me/saved').expect(200);
    expect(saved.body.items.map((p: PostItem) => p.id)).toEqual([postId]);
  });

  it('HU25 E2: quitarla de guardados la elimina de la lista sin afectar la publicación', async () => {
    const ana = await ctx.signUp('ana');
    const beto = await ctx.signUp('beto');
    const postId = await ctx.publish(ana, 'ya no');
    await ctx.as(beto).put(`/posts/${postId}/save`).expect(204);

    await ctx.as(beto).delete(`/posts/${postId}/save`).expect(204);

    const saved = await ctx.as(beto).get('/me/saved').expect(200);
    expect(saved.body.items).toEqual([]);
    expect(await profilePosts(beto, ana)).toEqual(['ya no']);
  });
});

describe('HU26 Seguir usuario', () => {
  it('HU26 E1: seguir a un usuario público registra la relación y su contenido aparece en mi feed', async () => {
    const ana = await ctx.signUp('ana');
    const beto = await ctx.signUp('beto');
    await ctx.publish(beto, 'hola desde Beto');
    expect(await feedOf(ana)).toEqual([]);

    const res = await ctx.as(ana).post(`/users/${beto.id}/follow`).expect(201);

    expect(res.body.status).toBe('ACCEPTED');
    expect(await feedOf(ana)).toEqual(['hola desde Beto']);
  });

  it('HU26 E2: seguir un perfil restringido envía una solicitud pendiente de aprobación', async () => {
    const ana = await ctx.signUp('ana');
    const beto = await ctx.signUp('beto');
    await ctx.publish(beto, 'restringida');
    await ctx
      .as(beto)
      .patch('/me/privacy', { visibility: 'FOLLOWERS' })
      .expect(200);

    const res = await ctx.as(ana).post(`/users/${beto.id}/follow`).expect(201);

    expect(res.body.status).toBe('PENDING');
    expect(await feedOf(ana)).toEqual([]);
    const requests = await ctx.as(beto).get('/follows/requests').expect(200);
    expect(requests.body.items).toHaveLength(1);
  });
});

describe('HU27 Dejar de seguir usuario', () => {
  it('HU27 E1: dejar de seguir elimina la relación y su contenido sale de mi feed', async () => {
    const ana = await ctx.signUp('ana');
    const beto = await ctx.signUp('beto');
    await ctx.publish(beto, 'de Beto');
    await ctx.as(ana).post(`/users/${beto.id}/follow`).expect(201);
    expect(await feedOf(ana)).toEqual(['de Beto']);

    await ctx.as(ana).delete(`/users/${beto.id}/follow`).expect(204);

    expect(await feedOf(ana)).toEqual([]);
    const followers = await ctx
      .as(ana)
      .get(`/users/${beto.id}/followers`)
      .expect(200);
    expect(followers.body.items).toEqual([]);
  });
});

describe('HU28 Reaccionar a publicación', () => {
  it('HU28 E1: reaccionar queda registrado y actualiza el conteo de la publicación', async () => {
    const ana = await ctx.signUp('ana');
    const beto = await ctx.signUp('beto');
    const postId = await ctx.publish(ana, 'reacciona');

    const res = await ctx
      .as(beto)
      .put(`/posts/${postId}/reaction`, { type: 'FIRE' })
      .expect(200);

    expect(res.body).toEqual({ reactionCount: 1, myReaction: 'FIRE' });
  });

  it('HU28 E2: quitar la reacción la elimina y actualiza el conteo', async () => {
    const ana = await ctx.signUp('ana');
    const beto = await ctx.signUp('beto');
    const postId = await ctx.publish(ana, 'reacciona');
    await ctx
      .as(beto)
      .put(`/posts/${postId}/reaction`, { type: 'FIRE' })
      .expect(200);

    const res = await ctx
      .as(beto)
      .delete(`/posts/${postId}/reaction`)
      .expect(200);

    expect(res.body).toEqual({ reactionCount: 0, myReaction: null });
  });
});

describe('HU29 Comentar publicación', () => {
  it('HU29 E1: un comentario se publica y aparece debajo de la publicación', async () => {
    const ana = await ctx.signUp('ana');
    const beto = await ctx.signUp('beto');
    const postId = await ctx.publish(ana, 'coméntame');

    await ctx
      .as(beto)
      .post(`/posts/${postId}/comments`, { content: 'Buen aporte' })
      .expect(201);

    const list = await ctx.as(ana).get(`/posts/${postId}/comments`).expect(200);
    expect(list.body.items.map((c: { content: string }) => c.content)).toEqual([
      'Buen aporte',
    ]);
  });

  it('HU29 E2: un comentario vacío no se envía y muestra un error de validación', async () => {
    const ana = await ctx.signUp('ana');
    const postId = await ctx.publish(ana, 'coméntame');

    const res = await ctx
      .as(ana)
      .post(`/posts/${postId}/comments`, { content: '   ' })
      .expect(400);

    expect(res.body.code).toBe('COMMENT_EMPTY');
    expect(await ctx.prisma.postComment.count()).toBe(0);
  });
});

describe('HU30 Editar comentario de publicación', () => {
  it('HU30 E1: el autor edita su comentario y se muestra con la nueva redacción', async () => {
    const ana = await ctx.signUp('ana');
    const beto = await ctx.signUp('beto');
    const postId = await ctx.publish(ana, 'coméntame');
    const created = await ctx
      .as(beto)
      .post(`/posts/${postId}/comments`, { content: 'antes' })
      .expect(201);

    const res = await ctx
      .as(beto)
      .patch(`/posts/${postId}/comments/${created.body.id}`, {
        content: 'después',
      })
      .expect(200);

    expect(res.body.content).toBe('después');
    expect(res.body.editedAt).not.toBeNull();
  });

  it('HU30 E2: quien no escribió el comentario no puede editarlo', async () => {
    const ana = await ctx.signUp('ana');
    const beto = await ctx.signUp('beto');
    const postId = await ctx.publish(ana, 'coméntame');
    const created = await ctx
      .as(beto)
      .post(`/posts/${postId}/comments`, { content: 'mío' })
      .expect(201);

    const res = await ctx
      .as(ana)
      .patch(`/posts/${postId}/comments/${created.body.id}`, {
        content: 'ajeno',
      })
      .expect(403);

    expect(res.body.code).toBe('NOT_COMMENT_AUTHOR');
  });
});

describe('HU31 Desactivar comentario de publicación', () => {
  it('HU31 E1: el autor desactiva su comentario, sale de la vista y queda su registro para auditoría', async () => {
    const ana = await ctx.signUp('ana');
    const beto = await ctx.signUp('beto');
    const postId = await ctx.publish(ana, 'coméntame');
    const created = await ctx
      .as(beto)
      .post(`/posts/${postId}/comments`, { content: 'bórralo' })
      .expect(201);

    await ctx
      .as(beto)
      .post(`/posts/${postId}/comments/${created.body.id}/deactivate`)
      .expect(204);

    const list = await ctx.as(ana).get(`/posts/${postId}/comments`).expect(200);
    expect(list.body.items).toEqual([]);
    expect(
      await ctx.prisma.auditLog.count({
        where: { action: 'post_comment.deactivate', entityId: created.body.id },
      }),
    ).toBe(1);
    const row = await ctx.prisma.postComment.findUniqueOrThrow({
      where: { id: created.body.id },
    });
    expect(row.deactivatedAt).not.toBeNull();
  });

  it('HU31 E2: quien no escribió el comentario no puede desactivarlo', async () => {
    const ana = await ctx.signUp('ana');
    const beto = await ctx.signUp('beto');
    const postId = await ctx.publish(ana, 'coméntame');
    const created = await ctx
      .as(beto)
      .post(`/posts/${postId}/comments`, { content: 'mío' })
      .expect(201);

    const res = await ctx
      .as(ana)
      .post(`/posts/${postId}/comments/${created.body.id}/deactivate`)
      .expect(403);

    expect(res.body.code).toBe('NOT_COMMENT_AUTHOR');
  });
});

describe('HU32 Ver lista de seguidores', () => {
  it('HU32 E1: la sección Seguidores muestra los usuarios que lo siguen', async () => {
    const ana = await ctx.signUp('ana');
    const beto = await ctx.signUp('beto');
    await ctx.as(ana).post(`/users/${beto.id}/follow`).expect(201);

    const res = await ctx
      .as(ana)
      .get(`/users/${beto.id}/followers`)
      .expect(200);

    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0]).toMatchObject({ handle: 'ana' });
  });

  it('HU32 E2: un usuario sin seguidores muestra una lista vacía', async () => {
    const ana = await ctx.signUp('ana');
    const beto = await ctx.signUp('beto');

    const res = await ctx
      .as(ana)
      .get(`/users/${beto.id}/followers`)
      .expect(200);

    expect(res.body.items).toEqual([]);
    expect(res.body.nextCursor).toBeNull();
  });
});
