import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../../src/app.module.js';
import { configureApp } from '../../src/app.setup.js';
import { Mailer, type MailMessage } from '../../src/common/mail/mailer.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { resetDb } from '../support/reset-db.js';

// Aceptación de HU03, "Recuperar contraseña" (spec 0008, decisión 10). Un
// escenario Gherkin por prueba, con su id en el nombre (decisión 37). El correo
// se reemplaza por un doble que guarda lo que habría enviado.
const EMAIL = 'cgomez@est.intec.edu.do';
const OLD_PASSWORD = 'clave-segura-2026';
const NEW_PASSWORD = 'clave-nueva-2027';

describe('HU03 Recuperar contraseña', () => {
  let app: NestExpressApplication;
  let server: App;
  let prisma: PrismaService;
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
    const career = await prisma.career.create({
      data: { name: 'Ingeniería de Software' },
    });
    // Dado que soy un estudiante registrado
    await request(server)
      .post('/api/v1/auth/register')
      .send({
        email: EMAIL,
        password: OLD_PASSWORD,
        firstName: 'Carlos',
        lastName: 'Gómez',
        handle: 'cgomez_intec',
        careerId: career.id,
        acceptTerms: true,
      })
      .expect(201);
  });

  // Una IP propia por llamada: el límite de pedidos por hora cuenta por IP.
  const forgot = (email: string) =>
    request(server)
      .post('/api/v1/auth/forgot-password')
      .set('X-Forwarded-For', `198.51.100.${++ipCounter}`)
      .send({ email });

  const login = (password: string) =>
    request(server).post('/api/v1/auth/login').send({ email: EMAIL, password });

  const tokenFromLastMail = (): string => {
    const match = /reset-password\?token=([A-Za-z0-9_-]+)/.exec(
      sent.at(-1)?.text ?? '',
    );
    if (!match?.[1]) throw new Error('El correo no trae un enlace');
    return match[1];
  };

  it('HU03 E1: solicitud de recuperación exitosa envía el enlace al correo institucional', async () => {
    // Cuando ingreso mi correo institucional registrado y confirmo la solicitud
    const res = await forgot(EMAIL);

    // Entonces el sistema envía un enlace de restablecimiento a ese correo y
    // responde con la confirmación del envío (la pantalla muestra el mensaje)
    expect(res.status).toBe(204);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: EMAIL });
    expect(sent[0]?.text).toContain('reset-password?token=');
  });

  it('HU03 E2: un correo no registrado recibe la misma respuesta y no se envía nada', async () => {
    // Dado que me encuentro en la pantalla "Olvidé mi contraseña"
    const known = await forgot(EMAIL);
    sent = [];

    // Cuando ingreso un correo que no está registrado en el sistema
    const unknown = await forgot('nadie@est.intec.edu.do');

    // Entonces el sistema no revela si el correo existe: respuesta idéntica
    expect(unknown.status).toBe(known.status);
    expect(unknown.text).toBe(known.text);
    expect(sent).toHaveLength(0);
  });

  it('HU03 E3: restablecimiento exitoso con el enlace vigente permite entrar con la nueva contraseña', async () => {
    // Dado que recibí el enlace de recuperación y accedo a él dentro del tiempo válido
    await forgot(EMAIL).expect(204);
    const token = tokenFromLastMail();

    // Cuando ingreso una nueva contraseña que cumple los requisitos y la confirmo
    await request(server)
      .post('/api/v1/auth/reset-password')
      .send({ token, password: NEW_PASSWORD })
      .expect(204);

    // Entonces el sistema actualiza mi contraseña y me permite iniciar sesión
    await login(NEW_PASSWORD).expect(200);
    await login(OLD_PASSWORD).expect(401);
  });
});
