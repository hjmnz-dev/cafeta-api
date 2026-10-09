import type { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import { Prisma } from '../../generated/prisma/client.js';
import type { ActorContext } from '../../common/actor/actor-context.js';
import type { AuditService } from '../../common/audit/audit.service.js';
import type { EnvironmentVariables } from '../../config/env.validation.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { CareersService } from '../careers/careers.service.js';
import type { CurrentUser, UsersService } from '../users/users.service.js';
import { BCRYPT_COST, DUMMY_PASSWORD_HASH } from './auth.constants.js';
import { AuthService } from './auth.service.js';
import type { RegisterDto } from './dto/register.dto.js';
import type { SessionsService } from './sessions.service.js';

// Reglas de AuthService (spec 0004) que las e2e no pueden forzar: la carrera
// de dos registros sobre el handle, la comparación con el hash de relleno y el
// dominio exacto. La base queda del otro lado de dobles por constructor.
const SECRET = 'secreto-de-prueba-con-mas-de-32-caracteres';
const USER_ID = '01926f00-0000-7000-8000-000000000001';
const SESSION_ID = '01926f00-0000-7000-8000-0000000000a1';
const EXPIRES_AT = new Date('2026-09-26T12:00:00.000Z');

const actor: ActorContext = {
  userId: null,
  role: null,
  ip: '10.0.0.7',
  userAgent: 'vitest',
};

const currentUser: CurrentUser = {
  id: USER_ID,
  email: 'cgomez@est.intec.edu.do',
  role: 'STUDENT',
  verificationStatus: 'PENDING',
  createdAt: '2026-10-02T14:00:00.000Z',
  profile: {
    handle: 'cgomez_intec',
    displayName: 'Carlos Gómez',
    careerId: '01926f00-0000-7000-8000-0000000000c1',
  },
};

const dto = (overrides: Partial<RegisterDto> = {}): RegisterDto => ({
  email: 'cgomez@est.intec.edu.do',
  password: 'clave-segura-2026',
  firstName: 'Carlos',
  lastName: 'Gómez',
  handle: 'cgomez_intec',
  careerId: '01926f00-0000-7000-8000-0000000000c1',
  acceptTerms: true,
  ...overrides,
});

const uniqueViolation = (meta: Record<string, unknown>) =>
  new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: '7.0.0',
    meta,
  });

function setup() {
  const users = {
    emailExists: vi.fn().mockResolvedValue(false),
    handleExists: vi.fn().mockResolvedValue(false),
    createStudent: vi.fn().mockResolvedValue(currentUser),
    findByEmailWithHash: vi.fn().mockResolvedValue(null),
    findCurrent: vi.fn().mockResolvedValue(currentUser),
  };
  const careers = { isActive: vi.fn().mockResolvedValue(true) };
  const sessions = {
    create: vi
      .fn()
      .mockResolvedValue({ id: SESSION_ID, expiresAt: EXPIRES_AT }),
    revoke: vi.fn().mockResolvedValue(undefined),
  };
  const audit = { record: vi.fn().mockResolvedValue(undefined) };
  const transaction = vi.fn((fn: (tx: unknown) => unknown) => fn({}));
  const prisma = { $transaction: transaction };
  const jwt = new JwtService({
    secret: SECRET,
    signOptions: { algorithm: 'HS256' },
  });
  const config = {
    get: () => 'est.intec.edu.do,intec.edu.do',
  } as unknown as ConfigService<EnvironmentVariables, true>;
  const service = new AuthService(
    prisma as unknown as PrismaService,
    users as unknown as UsersService,
    careers as unknown as CareersService,
    sessions as unknown as SessionsService,
    audit as unknown as AuditService,
    jwt,
    config,
  );
  return { service, users, careers, sessions, audit, transaction, jwt };
}

async function codeOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return (error as { getResponse: () => { code: string } }).getResponse()
      .code;
  }
  throw new Error('se esperaba un error');
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('AuthService.register', () => {
  it.each([
    'carlos@gmail.com',
    'carlos@evil.est.intec.edu.do',
    'carlos@est.intec.edu.do.evil.com',
    'carlos@intec.edu',
  ])(
    'AC-2: rechaza %s con EMAIL_NOT_INSTITUTIONAL sin consultar la base',
    async (email) => {
      const { service, users, transaction } = setup();
      expect(await codeOf(service.register(dto({ email }), actor))).toBe(
        'EMAIL_NOT_INSTITUTIONAL',
      );
      expect(users.emailExists).not.toHaveBeenCalled();
      expect(transaction).not.toHaveBeenCalled();
    },
  );

  it('AC-2: acepta también el dominio de docentes intec.edu.do', async () => {
    const { service } = setup();
    await expect(
      service.register(dto({ email: 'profe@intec.edu.do' }), actor),
    ).resolves.toMatchObject({ user: currentUser });
  });

  it('AC-3: si otro registro gana la carrera por el handle, responde HANDLE_TAKEN', async () => {
    const { service, transaction } = setup();
    transaction.mockRejectedValueOnce(
      uniqueViolation({ modelName: 'Profile', target: ['handle'] }),
    );
    expect(await codeOf(service.register(dto(), actor))).toBe('HANDLE_TAKEN');
  });

  it('AC-3: si otro registro gana la carrera por el correo, responde EMAIL_TAKEN', async () => {
    const { service, transaction } = setup();
    transaction.mockRejectedValueOnce(
      uniqueViolation({ modelName: 'User', target: ['email'] }),
    );
    expect(await codeOf(service.register(dto(), actor))).toBe('EMAIL_TAKEN');
  });

  it('deja pasar un P2002 de otro campo y cualquier otro error sin disfrazarlo', async () => {
    const { service, transaction } = setup();
    const otherUnique = uniqueViolation({ target: ['id'] });
    transaction.mockRejectedValueOnce(otherUnique);
    await expect(service.register(dto(), actor)).rejects.toBe(otherUnique);

    const crash = new Error('conexión perdida');
    transaction.mockRejectedValueOnce(crash);
    await expect(service.register(dto(), actor)).rejects.toBe(crash);
  });

  it('AC-1 y AC-12: guarda un hash bcrypt de costo 12 y audita con el usuario nuevo como actor', async () => {
    const { service, users, audit } = setup();
    await service.register(dto(), actor);

    const [, data] = users.createStudent.mock.calls[0] as [
      unknown,
      { passwordHash: string; displayName: string },
    ];
    expect(bcrypt.getRounds(data.passwordHash)).toBe(BCRYPT_COST);
    expect(await bcrypt.compare('clave-segura-2026', data.passwordHash)).toBe(
      true,
    );
    expect(data.displayName).toBe('Carlos Gómez');
    expect(audit.record).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: 'account.register',
        entityType: 'user',
        entityId: USER_ID,
        actor: {
          userId: USER_ID,
          role: 'STUDENT',
          ip: '10.0.0.7',
          userAgent: 'vitest',
        },
      }),
    );
  });

  it('AC-1: la sesión del registro no es recordada y el token apunta a ella', async () => {
    const { service, sessions, jwt } = setup();
    const res = await service.register(dto(), actor);

    expect(sessions.create).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ userId: USER_ID, remember: false }),
      expect.any(Date),
    );
    const payload = await jwt.verifyAsync<Record<string, unknown>>(
      res.accessToken,
      { ignoreExpiration: true },
    );
    expect(payload).toMatchObject({
      sub: USER_ID,
      jti: SESSION_ID,
      role: 'STUDENT',
      exp: EXPIRES_AT.getTime() / 1000,
    });
    expect(res.expiresAt).toBe(EXPIRES_AT.toISOString());
  });
});

describe('AuthService.login', () => {
  it('el hash de relleno es un bcrypt válido de costo 12', () => {
    expect(bcrypt.getRounds(DUMMY_PASSWORD_HASH)).toBe(BCRYPT_COST);
  });

  it('AC-6: con un correo inexistente compara contra el hash de relleno y responde INVALID_CREDENTIALS', async () => {
    const { service, sessions } = setup();
    const compare = vi.spyOn(bcrypt, 'compare');

    expect(
      await codeOf(
        service.login(
          { email: 'nadie@est.intec.edu.do', password: 'clave-segura-2026' },
          actor,
        ),
      ),
    ).toBe('INVALID_CREDENTIALS');
    expect(compare).toHaveBeenCalledWith(
      'clave-segura-2026',
      DUMMY_PASSWORD_HASH,
    );
    expect(sessions.create).not.toHaveBeenCalled();
  });

  it('AC-6 y AC-7: una cuenta desactivada con contraseña mala no revela que está desactivada', async () => {
    const { service, users } = setup();
    users.findByEmailWithHash.mockResolvedValue({
      id: USER_ID,
      role: 'STUDENT',
      passwordHash: await bcrypt.hash('clave-segura-2026', 4),
      deactivatedAt: new Date(),
    });
    expect(
      await codeOf(
        service.login(
          { email: 'cgomez@est.intec.edu.do', password: 'otra-clave-99' },
          actor,
        ),
      ),
    ).toBe('INVALID_CREDENTIALS');
  });

  it('AC-5: pasa "Recordarme" a la sesión y sin él la crea corta', async () => {
    const { service, users, sessions } = setup();
    users.findByEmailWithHash.mockResolvedValue({
      id: USER_ID,
      role: 'STUDENT',
      passwordHash: await bcrypt.hash('clave-segura-2026', 4),
      deactivatedAt: null,
    });
    const credentials = {
      email: 'cgomez@est.intec.edu.do',
      password: 'clave-segura-2026',
    };

    await service.login({ ...credentials, remember: true }, actor);
    await service.login(credentials, actor);

    expect(sessions.create.mock.calls.map((c) => c[1].remember)).toEqual([
      true,
      false,
    ]);
  });
});

describe('AuthService.me y logout', () => {
  it('me responde SESSION_REVOKED si el usuario ya no existe', async () => {
    const { service, users } = setup();
    users.findCurrent.mockResolvedValue(null);
    expect(await codeOf(service.me(USER_ID))).toBe('SESSION_REVOKED');
  });

  it('AC-8: logout revoca solo la sesión del token actual', async () => {
    const { service, sessions } = setup();
    await service.logout(SESSION_ID);
    expect(sessions.revoke).toHaveBeenCalledWith(SESSION_ID, expect.any(Date));
  });
});
