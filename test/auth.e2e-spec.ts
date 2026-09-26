import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { resetDb } from './support/reset-db.js';

// Registro, inicio y cierre de sesión (spec 0004) contra PostgreSQL real.
const HOUR_MS = 60 * 60 * 1000;
const PASSWORD = 'clave-segura-2026';

describe('Auth (e2e)', () => {
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

  const registration = (overrides: Record<string, unknown> = {}) => ({
    email: 'cgomez@est.intec.edu.do',
    password: PASSWORD,
    firstName: 'Carlos',
    lastName: 'Gómez',
    handle: 'cgomez_intec',
    careerId,
    acceptTerms: true,
    ...overrides,
  });

  const register = (overrides: Record<string, unknown> = {}) =>
    request(server)
      .post('/api/v1/auth/register')
      .set('User-Agent', 'cafeta-e2e')
      .send(registration(overrides));

  const login = (email: string, password: string, remember?: boolean) =>
    request(server)
      .post('/api/v1/auth/login')
      .send({ email, password, remember });

  const me = (token?: string) => {
    const req = request(server).get('/api/v1/auth/me');
    return token ? req.set('Authorization', `Bearer ${token}`) : req;
  };

  const hoursUntil = (iso: string) => (Date.parse(iso) - Date.now()) / HOUR_MS;

  it('AC-1 y AC-12: registrarse crea la cuenta, entra y audita', async () => {
    const res = await register().expect(201);
    expect(res.body.user).toMatchObject({
      email: 'cgomez@est.intec.edu.do',
      role: 'STUDENT',
      verificationStatus: 'PENDING',
      profile: {
        handle: 'cgomez_intec',
        displayName: 'Carlos Gómez',
        careerId,
      },
    });
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');
    expect(hoursUntil(res.body.expiresAt)).toBeCloseTo(12, 0);

    const user = await prisma.user.findUniqueOrThrow({
      where: { email: 'cgomez@est.intec.edu.do' },
      omit: { passwordHash: false },
      include: { notificationPreference: true },
    });
    expect(user.passwordHash).toMatch(/^\$2[ab]\$12\$/);
    expect(user.termsVersion).toBe('2026-09-borrador');
    expect(user.termsAcceptedAt).toBeInstanceOf(Date);
    expect(user.notificationPreference).not.toBeNull();

    const [entry] = await prisma.auditLog.findMany({
      where: { action: 'account.register' },
    });
    expect(entry).toMatchObject({
      actorId: user.id,
      actorRole: 'STUDENT',
      entityId: user.id,
      userAgent: 'cafeta-e2e',
    });

    const current = await me(res.body.accessToken).expect(200);
    expect(current.body.email).toBe('cgomez@est.intec.edu.do');
  });

  it('AC-1: el correo y el handle se guardan en minúsculas', async () => {
    await register({
      email: '  CGomez@EST.intec.edu.do ',
      handle: 'CGomez',
    }).expect(201);
    await login('CGOMEZ@est.intec.edu.do', PASSWORD).expect(200);
    const profile = await prisma.profile.findFirstOrThrow();
    expect(profile.handle).toBe('cgomez');
  });

  it('AC-2: un correo no institucional se rechaza', async () => {
    const res = await register({ email: 'carlos@gmail.com' }).expect(400);
    expect(res.body.code).toBe('EMAIL_NOT_INSTITUTIONAL');
  });

  it('AC-3: correo y handle repetidos, incluida una cuenta desactivada', async () => {
    await register().expect(201);
    const email = await register({ handle: 'otro' }).expect(409);
    expect(email.body.code).toBe('EMAIL_TAKEN');
    const handle = await register({ email: 'otro@est.intec.edu.do' }).expect(
      409,
    );
    expect(handle.body.code).toBe('HANDLE_TAKEN');

    await prisma.user.updateMany({ data: { deactivatedAt: new Date() } });
    const inactive = await register({ handle: 'tercero' }).expect(409);
    expect(inactive.body.code).toBe('EMAIL_TAKEN');
  });

  it('AC-3: dos registros simultáneos con el mismo correo dan un solo éxito', async () => {
    const results = await Promise.all([
      register({ handle: 'uno' }),
      register({ handle: 'dos' }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(results.find((r) => r.status === 409)?.body.code).toBe(
      'EMAIL_TAKEN',
    );
  });

  it('AC-4: reglas de contraseña, handle, carrera y términos', async () => {
    const cases: [Record<string, unknown>, string][] = [
      [{ password: 'sololetras' }, 'VALIDATION_ERROR'],
      [{ password: 'corta1' }, 'VALIDATION_ERROR'],
      [{ handle: 'a!' }, 'VALIDATION_ERROR'],
      [{ acceptTerms: false }, 'VALIDATION_ERROR'],
      [
        { careerId: '01926f00-0000-7000-8000-00000000dead' },
        'CAREER_NOT_FOUND',
      ],
    ];
    for (const [overrides, code] of cases) {
      const res = await register(overrides).expect(400);
      expect(res.body.code).toBe(code);
    }
    await prisma.career.update({
      where: { id: careerId },
      data: { deactivatedAt: new Date() },
    });
    const closed = await register().expect(400);
    expect(closed.body.code).toBe('CAREER_NOT_FOUND');
  });

  it('AC-5: Recordarme define si la sesión dura 12 horas o 30 días', async () => {
    await register().expect(201);
    const short = await login('cgomez@est.intec.edu.do', PASSWORD).expect(200);
    expect(hoursUntil(short.body.expiresAt)).toBeCloseTo(12, 0);
    const long = await login('cgomez@est.intec.edu.do', PASSWORD, true).expect(
      200,
    );
    expect(hoursUntil(long.body.expiresAt) / 24).toBeCloseTo(30, 0);
    expect(await prisma.session.count({ where: { remember: true } })).toBe(1);
  });

  it('AC-6: contraseña mala y correo inexistente responden igual', async () => {
    await register().expect(201);
    const wrong = await login(
      'cgomez@est.intec.edu.do',
      'otra-clave-99',
    ).expect(401);
    const missing = await login('nadie@est.intec.edu.do', PASSWORD).expect(401);
    expect(wrong.body).toEqual(missing.body);
    expect(wrong.body.code).toBe('INVALID_CREDENTIALS');
  });

  it('AC-7: una cuenta desactivada no entra y queda en la bitácora', async () => {
    await register().expect(201);
    await prisma.user.updateMany({ data: { deactivatedAt: new Date() } });
    const res = await login('cgomez@est.intec.edu.do', PASSWORD).expect(403);
    expect(res.body.code).toBe('ACCOUNT_INACTIVE');
    const [entry] = await prisma.auditLog.findMany({
      where: { action: 'access.denied' },
    });
    expect(entry?.metadata).toMatchObject({ code: 'ACCOUNT_INACTIVE' });
  });

  it('AC-8: cerrar sesión revoca el token', async () => {
    const { body } = await register().expect(201);
    await request(server)
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${body.accessToken}`)
      .expect(204);
    const after = await me(body.accessToken).expect(401);
    expect(after.body.code).toBe('SESSION_REVOKED');
    expect(
      await prisma.session.count({ where: { revokedAt: { not: null } } }),
    ).toBe(1);
  });

  it('AC-8: cerrar sesión solo revoca esa sesión, no las otras del usuario', async () => {
    const { body: first } = await register().expect(201);
    const { body: second } = await login(
      'cgomez@est.intec.edu.do',
      PASSWORD,
    ).expect(200);
    await request(server)
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${first.accessToken}`)
      .expect(204);
    await me(second.accessToken).expect(200);
  });

  it('AC-8: cerrar sesión dos veces con el mismo token responde SESSION_REVOKED', async () => {
    const { body } = await register().expect(201);
    const logout = () =>
      request(server)
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${body.accessToken}`);
    await logout().expect(204);
    const again = await logout().expect(401);
    expect(again.body.code).toBe('SESSION_REVOKED');
  });

  it('AC-9: cerrar sesión sin token responde UNAUTHORIZED', async () => {
    const res = await request(server).post('/api/v1/auth/logout').expect(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
  });

  it('AC-12: ni el login ni /auth/me devuelven el hash de la contraseña', async () => {
    await register().expect(201);
    const res = await login('cgomez@est.intec.edu.do', PASSWORD).expect(200);
    const current = await me(res.body.accessToken).expect(200);
    for (const body of [res.body, current.body]) {
      expect(JSON.stringify(body)).not.toMatch(/passwordHash|\$2[ab]\$/);
    }
  });

  it('AC-5: "remember" que no es booleano responde VALIDATION_ERROR', async () => {
    const res = await request(server)
      .post('/api/v1/auth/login')
      .send({
        email: 'cgomez@est.intec.edu.do',
        password: PASSWORD,
        remember: 'si',
      })
      .expect(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('AC-9: rutas protegidas sin token y rutas públicas sin token', async () => {
    expect((await me().expect(401)).body.code).toBe('UNAUTHORIZED');
    expect((await me('no-es-un-jwt').expect(401)).body.code).toBe(
      'UNAUTHORIZED',
    );
    await request(server)
      .get('/api/v1/health')
      .expect((res) => {
        expect([200, 503]).toContain(res.status);
      });
    const careers = await request(server).get('/api/v1/careers').expect(200);
    expect(careers.body).toEqual([
      { id: careerId, name: 'Ingeniería de Software' },
    ]);
  });

  it('AC-10: desactivar la cuenta corta la sesión abierta', async () => {
    const { body } = await register().expect(201);
    await me(body.accessToken).expect(200);
    await prisma.user.updateMany({ data: { deactivatedAt: new Date() } });
    const res = await me(body.accessToken).expect(401);
    expect(res.body.code).toBe('SESSION_REVOKED');
  });
});
