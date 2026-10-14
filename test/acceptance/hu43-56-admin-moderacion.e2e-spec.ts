import request from 'supertest';
import {
  API,
  PASSWORD,
  useAcceptance,
  type Account,
} from './support/acceptance.js';

// Aceptación de FT10 (administración y auditoría) y FT11 (seguridad y
// moderación): HU43 a HU56 (HU44 tiene su propio archivo). Un escenario
// Gherkin por prueba, con su id en el nombre (spec 0008, decisión 37).
const ctx = useAcceptance();

const REPORTS = '/admin/community-reports';

interface AdminUser {
  id: string;
  email: string;
  active?: boolean;
}

const usersList = async (admin: Account, query = '') =>
  (await ctx.as(admin).get(`/admin/users${query}`).expect(200)).body
    .items as AdminUser[];

const auditActions = async (admin: Account, query = '') =>
  (
    await ctx.as(admin).get(`/admin/audit-logs${query}`).expect(200)
  ).body.items.map((e: { action: string }) => e.action) as string[];

const reportUser = (
  reporter: Account,
  target: Account,
  reason = 'HARASSMENT',
) =>
  ctx.as(reporter).post('/reports', {
    targetType: 'USER',
    targetId: target.id,
    reason,
  });

const reportPost = (reporter: Account, postId: string, reason = 'SPAM') =>
  ctx.as(reporter).post('/reports', {
    targetType: 'POST',
    targetId: postId,
    reason,
  });

const pendingReports = async (admin: Account) =>
  (await ctx.as(admin).get(`${REPORTS}?status=PENDING`).expect(200)).body
    .items as { id: string }[];

describe('HU43 Ver dashboard administrativo', () => {
  it('HU43 E1: un administrador ve los indicadores generales de uso y actividad', async () => {
    const admin = await ctx.signUpAdmin('admin');
    const ana = await ctx.signUp('ana');
    await ctx.publish(ana, 'actividad');

    const res = await ctx.as(admin).get('/admin/dashboard').expect(200);

    expect(res.body).toMatchObject({
      // El dashboard cuenta a los estudiantes, no a los administradores.
      users: { total: 1 },
      posts: { total: 1 },
      pendingReports: 0,
    });
  });

  it('HU43 E2: un estudiante sin permisos administrativos recibe acceso denegado', async () => {
    const ana = await ctx.signUp('ana');

    const res = await ctx.as(ana).get('/admin/dashboard').expect(403);

    expect(res.body.code).toBe('FORBIDDEN');
    expect(res.body).not.toHaveProperty('users');
  });
});

describe('HU45 Ver bitácora de auditoría', () => {
  it('HU45 E1: el administrador ve el historial de acciones con usuario, acción y fecha', async () => {
    const admin = await ctx.signUpAdmin('admin');
    const ana = await ctx.signUp('ana');
    await ctx.publish(ana, 'deja rastro');

    const res = await ctx
      .as(admin)
      .get('/admin/audit-logs?action=post.create')
      .expect(200);

    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0]).toMatchObject({
      action: 'post.create',
      actor: { id: ana.id, handle: 'ana' },
    });
    expect(Date.parse(res.body.items[0].createdAt)).not.toBeNaN();
  });

  it('HU45 E2: filtrar por usuario o acción deja solo los registros que cumplen el filtro', async () => {
    const admin = await ctx.signUpAdmin('admin');
    const ana = await ctx.signUp('ana');
    const beto = await ctx.signUp('beto');
    await ctx.publish(ana, 'de Ana');
    await ctx.as(beto).post('/auth/logout').expect(204);

    const byAction = await auditActions(admin, '?action=post.create');
    const byActor = await ctx
      .as(admin)
      .get('/admin/audit-logs?actor=ana')
      .expect(200);

    expect(byAction).toEqual(['post.create']);
    expect(
      byActor.body.items.every(
        (e: { actor: { handle: string } }) => e.actor.handle === 'ana',
      ),
    ).toBe(true);
    expect(byActor.body.items.length).toBeGreaterThan(0);
  });
});

describe('HU46 Registrar log de auditoría del sistema', () => {
  it('HU46 E1: una acción relevante exitosa queda registrada con responsable, acción y hora', async () => {
    const admin = await ctx.signUpAdmin('admin');
    const ana = await ctx.signUp('ana');
    const postId = await ctx.publish(ana, 'la desactivo');

    await ctx.as(ana).post(`/posts/${postId}/deactivate`).expect(204);

    const entry = await ctx.prisma.auditLog.findFirstOrThrow({
      where: { action: 'post.deactivate', entityId: postId },
    });
    expect(entry).toMatchObject({ actorId: ana.id, succeeded: true });
    expect(entry.createdAt).toBeInstanceOf(Date);
    expect(await auditActions(admin, '?action=post.deactivate')).toEqual([
      'post.deactivate',
    ]);
  });

  it('HU46 E2: un intento sin permisos se rechaza, queda registrado como fallido y no cambia los datos', async () => {
    const ana = await ctx.signUp('ana');
    const beto = await ctx.signUp('beto');

    await ctx
      .as(ana)
      .post(`/admin/users/${beto.id}/deactivate`, { reason: 'sin permiso' })
      .expect(403);

    const denied = await ctx.prisma.auditLog.findFirstOrThrow({
      where: { action: 'access.denied', actorId: ana.id },
    });
    expect(denied.succeeded).toBe(false);
    const user = await ctx.prisma.user.findUniqueOrThrow({
      where: { id: beto.id },
    });
    expect(user.deactivatedAt).toBeNull();
  });
});

describe('HU47 Ver listado de usuarios', () => {
  it('HU47 E1: el administrador ve todas las cuentas con su estado y datos básicos', async () => {
    const admin = await ctx.signUpAdmin('admin');
    const ana = await ctx.signUp('ana');
    const beto = await ctx.signUp('beto');
    await ctx
      .as(admin)
      .post(`/admin/users/${beto.id}/deactivate`, { reason: 'prueba' })
      .expect(204);

    const all = await usersList(admin);

    expect(all.map((u) => u.email).sort()).toEqual(
      [admin.email, ana.email, beto.email].sort(),
    );
    const inactive = await usersList(admin, '?status=inactive');
    expect(inactive.map((u) => u.id)).toEqual([beto.id]);
  });

  it('HU47 E2: buscar por nombre o correo deja solo las coincidencias', async () => {
    const admin = await ctx.signUpAdmin('admin');
    const ana = await ctx.signUp('ana');
    await ctx.signUp('beto');

    const byName = await usersList(admin, '?search=ana');
    const byEmail = await usersList(admin, '?search=ana@est');

    expect(byName.map((u) => u.id)).toEqual([ana.id]);
    expect(byEmail.map((u) => u.id)).toEqual([ana.id]);
  });
});

describe('HU48 Desactivar cuenta de usuario', () => {
  it('HU48 E1: el administrador desactiva una cuenta, se restringe su acceso y queda en la bitácora', async () => {
    const admin = await ctx.signUpAdmin('admin');
    const ana = await ctx.signUp('ana');

    await ctx
      .as(admin)
      .post(`/admin/users/${ana.id}/deactivate`, { reason: 'Acoso reiterado' })
      .expect(204);

    const user = await ctx.prisma.user.findUniqueOrThrow({
      where: { id: ana.id },
    });
    expect(user.deactivatedAt).not.toBeNull();
    await ctx.as(ana).get('/auth/me').expect(401);
    expect(await auditActions(admin, '?action=account.deactivate')).toEqual([
      'account.deactivate',
    ]);
  });

  it('HU48 E2: un estudiante no puede desactivar la cuenta de otro usuario', async () => {
    const ana = await ctx.signUp('ana');
    const beto = await ctx.signUp('beto');

    const res = await ctx
      .as(ana)
      .post(`/admin/users/${beto.id}/deactivate`, { reason: 'intento' })
      .expect(403);

    expect(res.body.code).toBe('FORBIDDEN');
    const user = await ctx.prisma.user.findUniqueOrThrow({
      where: { id: beto.id },
    });
    expect(user.deactivatedAt).toBeNull();
  });
});

describe('HU49 Reactivar cuenta de usuario', () => {
  it('HU49 E1: el administrador reactiva una cuenta, el usuario recupera el acceso y queda en la bitácora', async () => {
    const admin = await ctx.signUpAdmin('admin');
    const ana = await ctx.signUp('ana');
    await ctx
      .as(admin)
      .post(`/admin/users/${ana.id}/deactivate`, { reason: 'prueba' })
      .expect(204);

    await ctx
      .as(admin)
      .post(`/admin/users/${ana.id}/reactivate`, { reason: 'Fue un error' })
      .expect(204);

    const login = await ctx.as(ana).get('/auth/me');
    expect(login.status).toBe(401); // el token de antes sigue cerrado
    const again = await request(ctx.server)
      .post(`${API}/auth/login`)
      .send({ email: ana.email, password: PASSWORD });
    expect(again.status).toBe(200);
    expect(await auditActions(admin, '?action=account.reactivate')).toEqual([
      'account.reactivate',
    ]);
  });

  it('HU49 E2: reactivar una cuenta que ya está activa indica que ya está activa', async () => {
    const admin = await ctx.signUpAdmin('admin');
    const ana = await ctx.signUp('ana');

    const res = await ctx
      .as(admin)
      .post(`/admin/users/${ana.id}/reactivate`, { reason: 'ya estaba' })
      .expect(409);

    expect(res.body.code).toBe('ALREADY_ACTIVE');
  });
});

describe('HU50 Verificar cuenta institucional', () => {
  it('HU50 E1: aprobar la verificación marca la cuenta como verificada y la insignia aparece en su perfil', async () => {
    const admin = await ctx.signUpAdmin('admin');
    const ana = await ctx.signUp('ana');
    const beto = await ctx.signUp('beto');

    await ctx
      .as(admin)
      .post(`/admin/users/${ana.id}/verification`, { decision: 'VERIFIED' })
      .expect(204);

    const profile = await ctx
      .as(beto)
      .get(`/users/${ana.id}/profile`)
      .expect(200);
    expect(profile.body.verified).toBe(true);
    const user = await ctx.prisma.user.findUniqueOrThrow({
      where: { id: ana.id },
    });
    expect(user.verificationStatus).toBe('VERIFIED');
  });

  it('HU50 E2: rechazar la verificación mantiene la cuenta sin verificar y avisa al usuario del resultado', async () => {
    const admin = await ctx.signUpAdmin('admin');
    const ana = await ctx.signUp('ana');
    const beto = await ctx.signUp('beto');

    await ctx
      .as(admin)
      .post(`/admin/users/${ana.id}/verification`, { decision: 'REJECTED' })
      .expect(204);

    const profile = await ctx
      .as(beto)
      .get(`/users/${ana.id}/profile`)
      .expect(200);
    expect(profile.body.verified).toBe(false);
    const notices = await ctx.prisma.notification.findMany({
      where: { recipientId: ana.id, type: 'VERIFICATION_RESULT' },
    });
    expect(notices).toHaveLength(1);
  });
});

describe('HU51 Revisar reportes de usuarios', () => {
  it('HU51 E1: sancionar un reporte desactiva la cuenta reportada y registra la resolución', async () => {
    const admin = await ctx.signUpAdmin('admin');
    const ana = await ctx.signUp('ana');
    const beto = await ctx.signUp('beto');
    const report = (await reportUser(ana, beto).expect(201)).body;

    await ctx
      .as(admin)
      .post(`${REPORTS}/${report.id}/resolve`, {
        action: 'DEACTIVATE_TARGET',
        note: 'Acoso reiterado',
      })
      .expect(204);

    const row = await ctx.prisma.report.findUniqueOrThrow({
      where: { id: report.id },
    });
    expect(row).toMatchObject({ status: 'SANCTIONED', resolvedById: admin.id });
    const user = await ctx.prisma.user.findUniqueOrThrow({
      where: { id: beto.id },
    });
    expect(user.deactivatedAt).not.toBeNull();
    expect(await pendingReports(admin)).toEqual([]);
  });

  it('HU51 E2: desestimar un reporte lo cierra sin aplicar restricciones a la cuenta', async () => {
    const admin = await ctx.signUpAdmin('admin');
    const ana = await ctx.signUp('ana');
    const beto = await ctx.signUp('beto');
    const report = (await reportUser(ana, beto).expect(201)).body;

    await ctx
      .as(admin)
      .post(`${REPORTS}/${report.id}/resolve`, { action: 'DISMISS' })
      .expect(204);

    const row = await ctx.prisma.report.findUniqueOrThrow({
      where: { id: report.id },
    });
    expect(row.status).toBe('DISMISSED');
    const user = await ctx.prisma.user.findUniqueOrThrow({
      where: { id: beto.id },
    });
    expect(user.deactivatedAt).toBeNull();
  });
});

describe('HU52 Revisar reportes de publicaciones', () => {
  it('HU52 E1: sancionar un reporte desactiva la publicación y registra la resolución', async () => {
    const admin = await ctx.signUpAdmin('admin');
    const ana = await ctx.signUp('ana');
    const beto = await ctx.signUp('beto');
    const postId = await ctx.publish(beto, 'contenido que infringe');
    const report = (await reportPost(ana, postId).expect(201)).body;

    await ctx
      .as(admin)
      .post(`${REPORTS}/${report.id}/resolve`, {
        action: 'DEACTIVATE_TARGET',
        note: 'Es spam',
      })
      .expect(204);

    const post = await ctx.prisma.post.findUniqueOrThrow({
      where: { id: postId },
    });
    expect(post.deactivatedAt).not.toBeNull();
    const row = await ctx.prisma.report.findUniqueOrThrow({
      where: { id: report.id },
    });
    expect(row).toMatchObject({ status: 'SANCTIONED', resolvedById: admin.id });
  });

  it('HU52 E2: desestimar un reporte lo cierra sin afectar la publicación', async () => {
    const admin = await ctx.signUpAdmin('admin');
    const ana = await ctx.signUp('ana');
    const beto = await ctx.signUp('beto');
    const postId = await ctx.publish(beto, 'contenido válido');
    const report = (await reportPost(ana, postId).expect(201)).body;

    await ctx
      .as(admin)
      .post(`${REPORTS}/${report.id}/resolve`, { action: 'DISMISS' })
      .expect(204);

    const post = await ctx.prisma.post.findUniqueOrThrow({
      where: { id: postId },
    });
    expect(post.deactivatedAt).toBeNull();
    const row = await ctx.prisma.report.findUniqueOrThrow({
      where: { id: report.id },
    });
    expect(row.status).toBe('DISMISSED');
  });
});

describe('HU53 Bloquear usuario', () => {
  it('HU53 E1: bloquear a alguien le impide ver mi contenido y deja de mostrarme su actividad', async () => {
    const ana = await ctx.signUp('ana');
    const beto = await ctx.signUp('beto');
    await ctx.publish(beto, 'de Beto');
    await ctx.follow(ana, beto);
    expect(
      (await ctx.as(ana).get('/posts/feed').expect(200)).body.items,
    ).toHaveLength(1);

    await ctx.as(ana).post(`/users/${beto.id}/block`).expect(200);

    expect(
      (await ctx.as(ana).get('/posts/feed').expect(200)).body.items,
    ).toEqual([]);
    await ctx.as(ana).get(`/users/${beto.id}/profile`).expect(404);
    const blocked = await ctx.as(ana).get('/blocks').expect(200);
    expect(blocked.body.items.map((b: { id: string }) => b.id)).toContain(
      beto.id,
    );
  });

  it('HU53 E2: el usuario bloqueado no puede ver mi perfil ni escribirme', async () => {
    const ana = await ctx.signUp('ana');
    const beto = await ctx.signUp('beto');
    await ctx.as(ana).post(`/users/${beto.id}/block`).expect(200);

    await ctx.as(beto).get(`/users/${ana.id}/profile`).expect(404);
    const message = await ctx
      .as(beto)
      .post('/conversations', { userId: ana.id });
    expect(message.status).toBeGreaterThanOrEqual(400);
  });
});

describe('HU54 Desbloquear usuario', () => {
  it('HU54 E1: desbloquear permite de nuevo la interacción según la privacidad vigente', async () => {
    const ana = await ctx.signUp('ana');
    const beto = await ctx.signUp('beto');
    await ctx.as(ana).post(`/users/${beto.id}/block`).expect(200);
    await ctx.as(beto).get(`/users/${ana.id}/profile`).expect(404);

    await ctx.as(ana).delete(`/users/${beto.id}/block`).expect(204);

    const profile = await ctx
      .as(beto)
      .get(`/users/${ana.id}/profile`)
      .expect(200);
    expect(profile.body.canSeeContent).toBe(true);
    const blocked = await ctx.as(ana).get('/blocks').expect(200);
    expect(blocked.body.items).toEqual([]);
  });
});

describe('HU55 Reportar usuario', () => {
  it('HU55 E1: reportar a un usuario con su motivo lo deja pendiente para los administradores', async () => {
    const admin = await ctx.signUpAdmin('admin');
    const ana = await ctx.signUp('ana');
    const beto = await ctx.signUp('beto');

    const res = await reportUser(ana, beto).expect(201);

    expect(res.body).toMatchObject({ targetType: 'USER', status: 'PENDING' });
    expect((await pendingReports(admin)).map((r) => r.id)).toEqual([
      res.body.id,
    ]);
  });

  it('HU55 E2: reportar de nuevo al mismo usuario indica que ya existe un reporte activo', async () => {
    const ana = await ctx.signUp('ana');
    const beto = await ctx.signUp('beto');
    await reportUser(ana, beto).expect(201);

    const res = await reportUser(ana, beto).expect(409);

    expect(res.body.code).toBe('REPORT_ALREADY_PENDING');
    expect(await ctx.prisma.report.count()).toBe(1);
  });
});

describe('HU56 Reportar publicación', () => {
  it('HU56 E1: reportar una publicación con su motivo la deja pendiente para los administradores', async () => {
    const admin = await ctx.signUpAdmin('admin');
    const ana = await ctx.signUp('ana');
    const beto = await ctx.signUp('beto');
    const postId = await ctx.publish(beto, 'dudosa');

    const res = await reportPost(ana, postId).expect(201);

    expect(res.body).toMatchObject({ targetType: 'POST', status: 'PENDING' });
    expect((await pendingReports(admin)).map((r) => r.id)).toEqual([
      res.body.id,
    ]);
  });

  it('HU56 E2: reportar de nuevo la misma publicación indica que ya existe un reporte activo', async () => {
    const ana = await ctx.signUp('ana');
    const beto = await ctx.signUp('beto');
    const postId = await ctx.publish(beto, 'dudosa');
    await reportPost(ana, postId).expect(201);

    const res = await reportPost(ana, postId).expect(409);

    expect(res.body.code).toBe('REPORT_ALREADY_PENDING');
    expect(await ctx.prisma.report.count()).toBe(1);
  });
});
