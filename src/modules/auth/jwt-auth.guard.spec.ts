import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { AuthenticatedUser } from '../../common/actor/actor-context.js';
import { AccessTokenService } from './access-token.service.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import type { SessionsService, ValidSession } from './sessions.service.js';

// Guard global de la spec 0004 (AC-9 y AC-10), con dobles por constructor.
const SECRET = 'secreto-de-prueba-con-mas-de-32-caracteres';
const USER_ID = '01926f00-0000-7000-8000-000000000001';
const OTHER_USER_ID = '01926f00-0000-7000-8000-000000000002';
const SESSION_ID = '01926f00-0000-7000-8000-0000000000a1';

type TestRequest = {
  headers: { authorization?: string };
  user?: AuthenticatedUser;
};

function contextFor(req: TestRequest): ExecutionContext {
  return {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

function setup({
  isPublic = false,
  session = {
    id: SESSION_ID,
    userId: USER_ID,
    role: 'STUDENT',
  } as ValidSession | null,
} = {}) {
  const jwt = new JwtService({
    secret: SECRET,
    signOptions: { algorithm: 'HS256' },
  });
  const reflector = {
    getAllAndOverride: vi.fn().mockReturnValue(isPublic),
  } as unknown as Reflector;
  const findValid = vi.fn().mockResolvedValue(session);
  const sessions = { findValid } as unknown as SessionsService;
  return {
    guard: new JwtAuthGuard(reflector, new AccessTokenService(jwt, sessions)),
    jwt,
    findValid,
  };
}

const sign = (
  jwt: JwtService,
  payload: Record<string, unknown> = {
    sub: USER_ID,
    jti: SESSION_ID,
    role: 'STUDENT',
  },
  options: { secret?: string; expiresIn?: number } = {},
) => jwt.signAsync(payload, options);

async function codeOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return (error as { getResponse: () => { code: string } }).getResponse()
      .code;
  }
  throw new Error('se esperaba un error');
}

describe('JwtAuthGuard', () => {
  it('AC-9: deja pasar una ruta @Public() sin token ni consulta a la base', async () => {
    const { guard, findValid } = setup({ isPublic: true });
    await expect(guard.canActivate(contextFor({ headers: {} }))).resolves.toBe(
      true,
    );
    expect(findValid).not.toHaveBeenCalled();
  });

  it('AC-9: sin encabezado Authorization responde UNAUTHORIZED', async () => {
    const { guard } = setup();
    expect(await codeOf(guard.canActivate(contextFor({ headers: {} })))).toBe(
      'UNAUTHORIZED',
    );
  });

  it('AC-9: un esquema que no es Bearer responde UNAUTHORIZED', async () => {
    const { guard, jwt } = setup();
    const token = await sign(jwt);
    const ctx = contextFor({ headers: { authorization: `Basic ${token}` } });
    expect(await codeOf(guard.canActivate(ctx))).toBe('UNAUTHORIZED');
  });

  it('AC-9: "Bearer" sin token responde UNAUTHORIZED', async () => {
    const { guard } = setup();
    const ctx = contextFor({ headers: { authorization: 'Bearer' } });
    expect(await codeOf(guard.canActivate(ctx))).toBe('UNAUTHORIZED');
  });

  it('un token firmado con otro secreto responde UNAUTHORIZED sin tocar la base', async () => {
    const { guard, jwt, findValid } = setup();
    const token = await sign(jwt, undefined, {
      secret: 'otro-secreto-que-no-es-el-de-la-api-000000',
    });
    const ctx = contextFor({ headers: { authorization: `Bearer ${token}` } });
    expect(await codeOf(guard.canActivate(ctx))).toBe('UNAUTHORIZED');
    expect(findValid).not.toHaveBeenCalled();
  });

  it('un token alterado responde UNAUTHORIZED', async () => {
    const { guard, jwt } = setup();
    const [header, , signature] = (await sign(jwt)).split('.');
    const forged = Buffer.from(
      JSON.stringify({ sub: OTHER_USER_ID, jti: SESSION_ID, role: 'ADMIN' }),
    ).toString('base64url');
    const ctx = contextFor({
      headers: { authorization: `Bearer ${header}.${forged}.${signature}` },
    });
    expect(await codeOf(guard.canActivate(ctx))).toBe('UNAUTHORIZED');
  });

  it('un token sin firma (alg none) responde UNAUTHORIZED', async () => {
    const { guard } = setup();
    const b64 = (value: object) =>
      Buffer.from(JSON.stringify(value)).toString('base64url');
    const unsigned = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ sub: USER_ID, jti: SESSION_ID })}.`;
    const ctx = contextFor({
      headers: { authorization: `Bearer ${unsigned}` },
    });
    expect(await codeOf(guard.canActivate(ctx))).toBe('UNAUTHORIZED');
  });

  it('un token vencido responde UNAUTHORIZED', async () => {
    const { guard, jwt } = setup();
    const token = await sign(jwt, {
      sub: USER_ID,
      jti: SESSION_ID,
      exp: Math.floor(Date.now() / 1000) - 60,
    });
    const ctx = contextFor({ headers: { authorization: `Bearer ${token}` } });
    expect(await codeOf(guard.canActivate(ctx))).toBe('UNAUTHORIZED');
  });

  it('un token bien firmado pero sin jti UUID responde UNAUTHORIZED sin tocar la base', async () => {
    const { guard, jwt, findValid } = setup();
    const token = await sign(jwt, { sub: USER_ID, jti: 'no-uuid' });
    const ctx = contextFor({ headers: { authorization: `Bearer ${token}` } });
    expect(await codeOf(guard.canActivate(ctx))).toBe('UNAUTHORIZED');
    expect(findValid).not.toHaveBeenCalled();
  });

  it('AC-8 y AC-10: una sesión revocada, vencida o de una cuenta desactivada responde SESSION_REVOKED', async () => {
    const { guard, jwt } = setup({ session: null });
    const token = await sign(jwt);
    const ctx = contextFor({ headers: { authorization: `Bearer ${token}` } });
    expect(await codeOf(guard.canActivate(ctx))).toBe('SESSION_REVOKED');
  });

  it('una sesión de otro usuario (sub distinto) responde SESSION_REVOKED', async () => {
    const { guard, jwt } = setup({
      session: { id: SESSION_ID, userId: OTHER_USER_ID, role: 'STUDENT' },
    });
    const token = await sign(jwt);
    const ctx = contextFor({ headers: { authorization: `Bearer ${token}` } });
    expect(await codeOf(guard.canActivate(ctx))).toBe('SESSION_REVOKED');
  });

  it('con sesión vigente pone req.user con el rol de la base, no el del token', async () => {
    const { guard, jwt, findValid } = setup({
      session: { id: SESSION_ID, userId: USER_ID, role: 'STUDENT' },
    });
    const token = await sign(jwt, {
      sub: USER_ID,
      jti: SESSION_ID,
      role: 'ADMIN',
    });
    const req: TestRequest = {
      headers: { authorization: `Bearer ${token}` },
    };

    await expect(guard.canActivate(contextFor(req))).resolves.toBe(true);

    expect(findValid).toHaveBeenCalledWith(SESSION_ID, expect.any(Date));
    expect(req.user).toEqual({
      id: USER_ID,
      role: 'STUDENT',
      sessionId: SESSION_ID,
    });
  });
});
