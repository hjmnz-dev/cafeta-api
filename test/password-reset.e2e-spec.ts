import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { Mailer, type MailMessage } from '../src/common/mail/mailer.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { resetDb } from './support/reset-db.js';

// Recuperar contraseña (spec 0008, decisión 10) contra PostgreSQL real, con el
// correo reemplazado por un doble que guarda lo que habría enviado.
const EMAIL = 'cgomez@est.intec.edu.do';
const OLD_PASSWORD = 'clave-segura-2026';
const NEW_PASSWORD = 'clave-nueva-2027';
const MINUTE_MS = 60 * 1000;

describe('Recuperar contraseña (e2e)', () => {
  let app: NestExpressApplication;
  let server: App;
  let prisma: PrismaService;
  let careerId: string;
  let sent: MailMessage[];
  let ipCounter = 0;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(Mailer)
      .useValue({
        send: (message: MailMessage) => {
          sent.push(message);
          return Promise.resolve();
        },
      })
      .compile();
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
    sent = [];
    careerId = (
      await prisma.career.create({ data: { name: 'Ingeniería de Software' } })
    ).id;
  });

  // Cada llamada usa una IP propia (trust proxy está activo): el límite de 3
  // pedidos por hora cuenta por IP y no debe pasar de una prueba a otra.
  const nextIp = () => `198.51.100.${++ipCounter}`;

  const register = () =>
    request(server).post('/api/v1/auth/register').send({
      email: EMAIL,
      password: OLD_PASSWORD,
      firstName: 'Carlos',
      lastName: 'Gómez',
      handle: 'cgomez_intec',
      careerId,
      acceptTerms: true,
    });

  const login = (password: string) =>
    request(server).post('/api/v1/auth/login').send({ email: EMAIL, password });

  const me = (accessToken: string) =>
    request(server)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${accessToken}`);

  const forgot = (email: string, ip = nextIp()) =>
    request(server)
      .post('/api/v1/auth/forgot-password')
      .set('X-Forwarded-For', ip)
      .send({ email });

  const reset = (token: string, password = NEW_PASSWORD) =>
    request(server)
      .post('/api/v1/auth/reset-password')
      .send({ token, password });

  // El token solo existe en el enlace del correo: se lee de lo que "salió".
  const tokenFromLastMail = (): string => {
    const text = sent.at(-1)?.text ?? '';
    const match = /reset-password\?token=([A-Za-z0-9_-]+)/.exec(text);
    if (!match?.[1]) throw new Error('El correo no trae un enlace');
    return match[1];
  };

  const registered = async () => {
    const res = await register().expect(201);
    return res.body as { accessToken: string; user: { id: string } };
  };

  it('AC-1: con una cuenta activa manda el correo con el enlace y guarda solo el hash', async () => {
    const { user } = await registered();

    const res = await forgot(EMAIL).expect(204);
    expect(res.text).toBe('');

    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      to: EMAIL,
      subject: 'Restablece tu contraseña de Cafeta',
    });
    expect(sent[0]?.text).toContain(
      'http://localhost:5173/reset-password?token=',
    );
    expect(sent[0]?.text).toContain('30 minutos');

    const token = tokenFromLastMail();
    const rows = await prisma.passwordResetToken.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ userId: user.id, usedAt: null });
    expect(rows[0]?.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(rows[0]?.tokenHash).not.toBe(token);
    const minutes =
      ((rows[0]?.expiresAt.getTime() ?? 0) - Date.now()) / MINUTE_MS;
    expect(minutes).toBeGreaterThan(29);
    expect(minutes).toBeLessThanOrEqual(30);
  });

  it('AC-2: un correo sin cuenta recibe la misma respuesta y no sale nada', async () => {
    await registered();

    const known = await forgot(EMAIL).expect(204);
    sent = [];
    await prisma.passwordResetToken.deleteMany();
    const unknown = await forgot('nadie@est.intec.edu.do').expect(204);

    expect(unknown.status).toBe(known.status);
    expect(unknown.text).toBe(known.text);
    expect(sent).toHaveLength(0);
    expect(await prisma.passwordResetToken.count()).toBe(0);
  });

  it('AC-2: una cuenta desactivada tampoco recibe correo', async () => {
    await registered();
    await prisma.user.update({
      where: { email: EMAIL },
      data: { deactivatedAt: new Date() },
    });

    await forgot(EMAIL).expect(204);

    expect(sent).toHaveLength(0);
    expect(await prisma.passwordResetToken.count()).toBe(0);
  });

  it('AC-3: el enlace permite entrar con la contraseña nueva y la vieja deja de servir', async () => {
    await registered();
    await forgot(EMAIL).expect(204);

    await reset(tokenFromLastMail()).expect(204);

    await login(NEW_PASSWORD).expect(200);
    const old = await login(OLD_PASSWORD).expect(401);
    expect(old.body.code).toBe('INVALID_CREDENTIALS');
  });

  it('AC-4: el enlace sirve una sola vez', async () => {
    await registered();
    await forgot(EMAIL).expect(204);
    const token = tokenFromLastMail();
    await reset(token).expect(204);

    const again = await reset(token, 'otra-clave-2028').expect(400);

    expect(again.body).toMatchObject({
      statusCode: 400,
      code: 'RESET_TOKEN_INVALID',
    });
    await login(NEW_PASSWORD).expect(200);
    await login('otra-clave-2028').expect(401);
  });

  it('AC-4: un enlace vencido responde RESET_TOKEN_INVALID', async () => {
    await registered();
    await forgot(EMAIL).expect(204);
    await prisma.passwordResetToken.updateMany({
      data: { expiresAt: new Date(Date.now() - MINUTE_MS) },
    });

    const res = await reset(tokenFromLastMail()).expect(400);

    expect(res.body.code).toBe('RESET_TOKEN_INVALID');
    await login(OLD_PASSWORD).expect(200);
  });

  it('AC-4: un token inventado responde RESET_TOKEN_INVALID', async () => {
    await registered();

    const res = await reset('x'.repeat(43)).expect(400);

    expect(res.body.code).toBe('RESET_TOKEN_INVALID');
  });

  it('AC-5: pedir un enlace nuevo invalida el anterior', async () => {
    await registered();
    await forgot(EMAIL).expect(204);
    const first = tokenFromLastMail();
    await forgot(EMAIL).expect(204);
    const second = tokenFromLastMail();

    expect(second).not.toBe(first);
    const res = await reset(first).expect(400);
    expect(res.body.code).toBe('RESET_TOKEN_INVALID');
    await reset(second).expect(204);
  });

  it('AC-6: usar el enlace cierra todas las sesiones y deja la auditoría', async () => {
    const { accessToken, user } = await registered();
    const second = (await login(OLD_PASSWORD).expect(200)).body as {
      accessToken: string;
    };
    await me(accessToken).expect(200);
    await forgot(EMAIL).expect(204);

    await reset(tokenFromLastMail()).expect(204);

    await me(accessToken).expect(401);
    await me(second.accessToken).expect(401);
    const entry = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'account.password_reset' },
    });
    expect(entry).toMatchObject({
      entityType: 'user',
      entityId: user.id,
      actorId: user.id,
      succeeded: true,
    });
    expect(JSON.stringify(entry)).not.toContain(NEW_PASSWORD);
  });

  it('AC-7: la contraseña nueva pasa las mismas reglas que al registrarse', async () => {
    await registered();
    await forgot(EMAIL).expect(204);
    const token = tokenFromLastMail();

    await reset(token, 'corta1').expect(400);
    await reset(token, 'solo-letras-sin-numero').expect(400);
    await reset(token, '1234567890').expect(400);

    // Los rechazos no gastan el enlace.
    await reset(token).expect(204);
  });

  it('AC-8: un correo mal escrito responde 400 de validación', async () => {
    const res = await forgot('no-es-correo').expect(400);
    expect(res.body.statusCode).toBe(400);
  });

  it('AC-9: el cuarto pedido en una hora desde la misma IP responde 429', async () => {
    await registered();
    const ip = nextIp();
    for (let i = 0; i < 3; i++) await forgot(EMAIL, ip).expect(204);

    const blocked = await forgot(EMAIL, ip).expect(429);

    expect(blocked.body).toMatchObject({
      statusCode: 429,
      code: 'TOO_MANY_REQUESTS',
    });
    await forgot(EMAIL, nextIp()).expect(204);
  });

  it('AC-9: reset-password no usa el límite de pedidos de enlace', async () => {
    const ip = nextIp();
    for (let i = 0; i < 5; i++) {
      await request(server)
        .post('/api/v1/auth/reset-password')
        .set('X-Forwarded-For', ip)
        .send({ token: 'x'.repeat(43), password: NEW_PASSWORD })
        .expect(400);
    }
  });
});
