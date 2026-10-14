import request from 'supertest';
import { API, PASSWORD, useAcceptance } from './support/acceptance.js';

// Aceptación de FT01, "Gestión de acceso y autenticación": HU01, HU02, HU04,
// HU05, HU06, HU07 y HU08 (HU03 tiene su propio archivo). Un escenario Gherkin
// por prueba, con su id en el nombre (spec 0008, decisión 37).
const ctx = useAcceptance();

const registration = (overrides: Record<string, unknown> = {}) => ({
  email: 'cgomez@est.intec.edu.do',
  password: PASSWORD,
  firstName: 'Carlos',
  lastName: 'Gómez',
  handle: 'cgomez_intec',
  careerId: ctx.careerId,
  acceptTerms: true,
  ...overrides,
});

const register = (overrides: Record<string, unknown> = {}) =>
  request(ctx.server)
    .post(`${API}/auth/register`)
    .send(registration(overrides));

const login = (email: string, password: string) =>
  request(ctx.server).post(`${API}/auth/login`).send({ email, password });

describe('HU01 Registrar usuario', () => {
  it('HU01 E1: un correo institucional válido crea la cuenta y entrega la sesión', async () => {
    // Cuando ingreso un correo institucional válido, una contraseña segura y mis datos
    const res = await register().expect(201);

    // Entonces el sistema crea mi cuenta y me da acceso (la web me lleva al feed)
    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body.user).toMatchObject({
      email: 'cgomez@est.intec.edu.do',
      role: 'STUDENT',
      profile: { handle: 'cgomez_intec', displayName: 'Carlos Gómez' },
    });
    const user = await ctx.prisma.user.findUniqueOrThrow({
      where: { email: 'cgomez@est.intec.edu.do' },
    });
    expect(user.deactivatedAt).toBeNull();
    await ctx
      .as({ ...res.body.user, token: res.body.accessToken })
      .get('/auth/me')
      .expect(200);
  });

  it('HU01 E2: un correo que no es institucional se rechaza con su código', async () => {
    const res = await register({ email: 'carlos@gmail.com' }).expect(400);

    expect(res.body.code).toBe('EMAIL_NOT_INSTITUTIONAL');
    expect(await ctx.prisma.user.count()).toBe(0);
  });

  it('HU01 E3: un correo ya registrado se rechaza e indica que la cuenta existe', async () => {
    await register().expect(201);

    const res = await register({ handle: 'otro_handle' }).expect(409);

    expect(res.body.code).toBe('EMAIL_TAKEN');
    expect(await ctx.prisma.user.count()).toBe(1);
  });
});

describe('HU02 Iniciar sesión', () => {
  beforeEach(async () => {
    await register().expect(201);
  });

  it('HU02 E1: con credenciales correctas entrega la sesión y da acceso a mi cuenta', async () => {
    const res = await login('cgomez@est.intec.edu.do', PASSWORD).expect(200);

    expect(res.body.accessToken).toEqual(expect.any(String));
    const me = await request(ctx.server)
      .get(`${API}/auth/me`)
      .set('Authorization', `Bearer ${res.body.accessToken}`)
      .expect(200);
    expect(me.body.email).toBe('cgomez@est.intec.edu.do');
  });

  it('HU02 E2: una contraseña incorrecta se deniega con un mensaje que no dice cuál dato falló', async () => {
    const wrongPassword = await login(
      'cgomez@est.intec.edu.do',
      'otra-clave-1',
    ).expect(401);
    const unknownEmail = await login('nadie@est.intec.edu.do', PASSWORD).expect(
      401,
    );

    expect(wrongPassword.body.code).toBe('INVALID_CREDENTIALS');
    // Mismo código y mismo mensaje para un correo que no existe.
    expect(unknownEmail.body.code).toBe(wrongPassword.body.code);
    expect(unknownEmail.body.message).toBe(wrongPassword.body.message);
  });

  it('HU02 E3: una cuenta desactivada no entra y se le dice que no está activa', async () => {
    await ctx.prisma.user.update({
      where: { email: 'cgomez@est.intec.edu.do' },
      data: { deactivatedAt: new Date() },
    });

    const res = await login('cgomez@est.intec.edu.do', PASSWORD).expect(403);

    expect(res.body.code).toBe('ACCOUNT_INACTIVE');
  });
});

describe('HU04 Cerrar sesión', () => {
  it('HU04 E1: cerrar sesión invalida la sesión activa', async () => {
    const ana = await ctx.signUp('ana');

    await ctx.as(ana).post('/auth/logout').expect(204);

    const res = await ctx.as(ana).get('/auth/me').expect(401);
    expect(res.body.code).toBe('SESSION_REVOKED');
  });

  it('HU04 E2: tras cerrar sesión, una pantalla que exige sesión ya no abre con ese token', async () => {
    const ana = await ctx.signUp('ana');
    await ctx.as(ana).post('/auth/logout').expect(204);

    // La web manda al inicio de sesión cuando la API responde 401.
    await ctx.as(ana).get('/posts/feed').expect(401);
    await ctx.as(ana).get('/notifications').expect(401);
    await ctx.as(ana).get('/conversations').expect(401);
  });
});

describe('HU05 Desactivar cuenta', () => {
  it('HU05 E1: confirmar con mi contraseña desactiva la cuenta y conserva el historial', async () => {
    const ana = await ctx.signUp('ana');
    await ctx.publish(ana, 'mi publicación');

    await ctx
      .as(ana)
      .post('/me/deactivate', { password: PASSWORD })
      .expect(204);

    const user = await ctx.prisma.user.findUniqueOrThrow({
      where: { id: ana.id },
    });
    expect(user.deactivatedAt).not.toBeNull();
    expect(await ctx.prisma.post.count({ where: { authorId: ana.id } })).toBe(
      1,
    );
    expect(
      await ctx.prisma.auditLog.count({
        where: { action: 'account.deactivate', actorId: ana.id },
      }),
    ).toBe(1);
    const again = await login(ana.email, PASSWORD).expect(403);
    expect(again.body.code).toBe('ACCOUNT_INACTIVE');
  });

  it('HU05 E2: sin la confirmación correcta la cuenta no se desactiva', async () => {
    const ana = await ctx.signUp('ana');

    const wrong = await ctx
      .as(ana)
      .post('/me/deactivate', { password: 'otra-clave-1' })
      .expect(403);
    await ctx.as(ana).post('/me/deactivate').expect(400);

    expect(wrong.body.code).toBe('INVALID_PASSWORD');
    const user = await ctx.prisma.user.findUniqueOrThrow({
      where: { id: ana.id },
    });
    expect(user.deactivatedAt).toBeNull();
    await ctx.as(ana).get('/auth/me').expect(200);
  });
});

describe('HU06 Ver configuración de cuenta', () => {
  it('HU06 E1: la configuración trae mis datos, mi privacidad y mis preferencias de notificación', async () => {
    const ana = await ctx.signUp('ana');

    const me = await ctx.as(ana).get('/auth/me').expect(200);
    const privacy = await ctx.as(ana).get('/me/privacy').expect(200);
    const notifications = await ctx
      .as(ana)
      .get('/notifications/preferences')
      .expect(200);

    expect(me.body).toMatchObject({
      email: 'ana@est.intec.edu.do',
      role: 'STUDENT',
      profile: { handle: 'ana' },
    });
    expect(new Date(me.body.createdAt).toISOString()).toBe(me.body.createdAt);
    expect(privacy.body).toEqual({ visibility: 'PUBLIC' });
    expect(notifications.body).toEqual({
      reactions: true,
      comments: true,
      follows: true,
      messages: true,
      stories: true,
    });
  });
});

describe('HU07 Configurar privacidad de la cuenta', () => {
  it('HU07 E1: cambiar la visibilidad a "Solo seguidores" se guarda y queda auditado', async () => {
    const ana = await ctx.signUp('ana');

    const saved = await ctx
      .as(ana)
      .patch('/me/privacy', { visibility: 'FOLLOWERS' })
      .expect(200);

    expect(saved.body).toEqual({ visibility: 'FOLLOWERS' });
    const again = await ctx.as(ana).get('/me/privacy').expect(200);
    expect(again.body).toEqual({ visibility: 'FOLLOWERS' });
    expect(
      await ctx.prisma.auditLog.count({ where: { action: 'privacy.update' } }),
    ).toBe(1);
  });

  it('HU07 E2: con "Solo seguidores", quien no me sigue ve una versión limitada de mi perfil', async () => {
    const ana = await ctx.signUp('ana');
    const beto = await ctx.signUp('beto');
    await ctx.publish(beto, 'solo para seguidores');
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
      canFollow: true,
    });
    expect(posts.body.code).toBe('PROFILE_RESTRICTED');
  });
});

describe('HU08 Configurar preferencias de notificaciones', () => {
  it('HU08 E1: apagar "Comentarios" deja de avisarme de comentarios y mantiene los demás tipos', async () => {
    const ana = await ctx.signUp('ana');
    const beto = await ctx.signUp('beto');
    const postId = await ctx.publish(ana, 'una publicación');
    await ctx
      .as(ana)
      .patch('/notifications/preferences', { comments: false })
      .expect(200);

    await ctx
      .as(beto)
      .post(`/posts/${postId}/comments`, { content: 'Hola' })
      .expect(201);
    await ctx
      .as(beto)
      .put(`/posts/${postId}/reaction`, { type: 'HEART' })
      .expect(200);

    const list = await ctx.as(ana).get('/notifications').expect(200);
    const types = list.body.items.map((n: { type: string }) => n.type);
    expect(types).not.toContain('POST_COMMENT');
    expect(types).toContain('POST_REACTION');
    // Control: el mismo comentario sí avisa a quien no apagó el tipo.
    const betoPost = await ctx.publish(beto, 'otra publicación');
    await ctx
      .as(ana)
      .post(`/posts/${betoPost}/comments`, { content: 'Hola Beto' })
      .expect(201);
    const betoList = await ctx.as(beto).get('/notifications').expect(200);
    expect(betoList.body.items.map((n: { type: string }) => n.type)).toContain(
      'POST_COMMENT',
    );
    const prefs = await ctx
      .as(ana)
      .get('/notifications/preferences')
      .expect(200);
    expect(prefs.body).toMatchObject({ comments: false, reactions: true });
  });
});
