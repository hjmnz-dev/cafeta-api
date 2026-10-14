import { Test, type TestingModuleBuilder } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../../../src/app.module.js';
import { MediaStorage } from '../../../src/modules/uploads/media-storage.js';
import { configureApp } from '../../../src/app.setup.js';
import { PrismaService } from '../../../src/prisma/prisma.service.js';
import { MemoryMediaStorage } from '../../support/memory-media-storage.js';
import { resetDb } from '../../support/reset-db.js';

// Arnés común de las pruebas de aceptación (spec 0008, decisión 37): arranca la
// app real contra cafeta_test, limpia las tablas antes de cada prueba y da los
// atajos para crear cuentas. Cada archivo de HU lo usa con `useAcceptance()`.
export const PASSWORD = 'clave-segura-2026';
export const API = '/api/v1';
// Cabecera mínima de un PNG: la API solo mira el tipo, no decodifica la imagen.
export const PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d,
]);
export const PDF = Buffer.from('%PDF-1.7\n%fin');

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
  /** Cliente de la API con el token de la cuenta (supertest, sin `/api/v1`). */
  as: (account: Account) => AsClient;
  /** Publica un texto como la cuenta y devuelve el id de la publicación. */
  publish: (account: Account, content: string) => Promise<string>;
  /** Seguimiento ya aceptado, directo en la base (no es lo que se prueba). */
  follow: (follower: Account, following: Account) => Promise<void>;
  /** Sube un archivo como la cuenta y devuelve su `key`. */
  upload: (account: Account, data: Buffer, name: string) => Promise<string>;
  /** Publica una historia con una imagen y devuelve su id. */
  publishStory: (account: Account, text?: string) => Promise<string>;
}

type Send = (path: string, body?: Record<string, unknown>) => request.Test;

export interface AsClient {
  get: (path: string) => request.Test;
  post: Send;
  put: Send;
  patch: Send;
  delete: (path: string) => request.Test;
}

interface Options {
  /** Cambia proveedores antes de compilar (por ejemplo el correo). */
  override?: (builder: TestingModuleBuilder) => TestingModuleBuilder;
}

export function useAcceptance(options: Options = {}): AcceptanceContext {
  const ctx = {} as AcceptanceContext;
  let ipCounter = 0;

  beforeAll(async () => {
    // El blob va en memoria: las pruebas no dependen de Azure ni de Azurite.
    const base = Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MediaStorage)
      .useValue(new MemoryMediaStorage());
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

  ctx.as = (account) => {
    const headers = ctx.auth(account);
    const url = (path: string) => `${API}${path}`;
    return {
      get: (path) => request(ctx.server).get(url(path)).set(headers),
      post: (path, body = {}) =>
        request(ctx.server).post(url(path)).set(headers).send(body),
      put: (path, body = {}) =>
        request(ctx.server).put(url(path)).set(headers).send(body),
      patch: (path, body = {}) =>
        request(ctx.server).patch(url(path)).set(headers).send(body),
      delete: (path) => request(ctx.server).delete(url(path)).set(headers),
    };
  };

  ctx.publish = async (account, content) => {
    const res = await ctx.as(account).post('/posts', { content }).expect(201);
    return res.body.id as string;
  };

  ctx.follow = async (follower, following) => {
    await ctx.prisma.follow.create({
      data: {
        followerId: follower.id,
        followingId: following.id,
        status: 'ACCEPTED',
      },
    });
  };

  ctx.upload = async (account, data, name) => {
    const res = await request(ctx.server)
      .post(`${API}/uploads`)
      .set(ctx.auth(account))
      .attach('file', data, name)
      .expect(201);
    return res.body.key as string;
  };

  ctx.publishStory = async (account, text) => {
    const mediaKey = await ctx.upload(account, PNG, 'foto.png');
    const res = await ctx
      .as(account)
      .post('/stories', { mediaKey, ...(text ? { text } : {}) })
      .expect(201);
    return res.body.id as string;
  };

  return ctx;
}
