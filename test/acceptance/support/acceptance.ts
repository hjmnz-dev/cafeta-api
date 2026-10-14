import { Test, type TestingModuleBuilder } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../../../src/app.module.js';
import { configureApp } from '../../../src/app.setup.js';
import { PrismaService } from '../../../src/prisma/prisma.service.js';
import { resetDb } from '../../support/reset-db.js';

// Arnés común de las pruebas de aceptación (spec 0008, decisión 37): arranca la
// app real contra cafeta_test, limpia las tablas antes de cada prueba y da los
// atajos para crear cuentas. Cada archivo de HU lo usa con `useAcceptance()`.
export const PASSWORD = 'clave-segura-2026';
export const API = '/api/v1';

export interface Account {
  id: string;
  token: string;
  handle: string;
  email: string;
}

export interface AcceptanceContext {
  app: NestExpressApplication;
  server: App;
  prisma: PrismaService;
  careerId: string;
  /** Crea una cuenta estudiante por la API real y deja su token. */
  signUp: (handle: string) => Promise<Account>;
  /** Crea una cuenta y la sube a ADMIN por la base (no hay ruta pública). */
  signUpAdmin: (handle: string) => Promise<Account>;
  /** Cabecera Authorization para supertest. */
  auth: (account: Account) => { Authorization: string };
  /** Una IP distinta por llamada, para los límites de peticiones por IP. */
  nextIp: () => string;
}

interface Options {
  /** Cambia proveedores antes de compilar (por ejemplo el correo). */
  override?: (builder: TestingModuleBuilder) => TestingModuleBuilder;
}

export function useAcceptance(options: Options = {}): AcceptanceContext {
  const ctx = {} as AcceptanceContext;
  let ipCounter = 0;

  beforeAll(async () => {
    const base = Test.createTestingModule({ imports: [AppModule] });
    const moduleRef = await (options.override?.(base) ?? base).compile();
    ctx.app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(ctx.app);
    await ctx.app.init();
    ctx.server = ctx.app.getHttpServer();
    ctx.prisma = ctx.app.get(PrismaService);
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  beforeEach(async () => {
    await resetDb(ctx.prisma);
    ctx.careerId = (
      await ctx.prisma.career.create({
        data: { name: 'Ingeniería de Software' },
      })
    ).id;
  });

  ctx.signUp = async (handle) => {
    const email = `${handle}@est.intec.edu.do`;
    const res = await request(ctx.server)
      .post(`${API}/auth/register`)
      .send({
        email,
        password: PASSWORD,
        firstName: handle,
        lastName: 'Prueba',
        handle,
        careerId: ctx.careerId,
        acceptTerms: true,
      })
      .expect(201);
    return {
      id: res.body.user.id as string,
      token: res.body.accessToken as string,
      handle,
      email,
    };
  };

  ctx.signUpAdmin = async (handle) => {
    const account = await ctx.signUp(handle);
    await ctx.prisma.user.update({
      where: { id: account.id },
      data: { role: 'ADMIN' },
    });
    return account;
  };

  ctx.auth = (account) => ({ Authorization: `Bearer ${account.token}` });
  ctx.nextIp = () => `198.51.100.${++ipCounter}`;

  return ctx;
}
