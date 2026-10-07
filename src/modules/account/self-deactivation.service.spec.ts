import { vi } from 'vitest';
import bcrypt from 'bcryptjs';
import type {
  ActorContext,
  AuthenticatedUser,
} from '../../common/actor/actor-context.js';
import type { UserAccountService } from '../users/user-account.service.js';
import type { AccountStateService } from './account-state.service.js';
import { SelfDeactivationService } from './self-deactivation.service.js';

// Reglas de la baja voluntaria (HU05, spec 0009 decisión 11) con dobles por
// constructor: la contraseña, el caso del admin y que no cambie nada si falla.
const USER_ID = '01926f00-0000-7000-8000-000000000001';
const PASSWORD = 'clave-segura-2026';

const actor: ActorContext = {
  userId: USER_ID,
  role: 'STUDENT',
  ip: '10.0.0.7',
  userAgent: 'vitest',
};

const student: AuthenticatedUser = {
  id: USER_ID,
  role: 'STUDENT',
  sessionId: '01926f00-0000-7000-8000-0000000000a1',
};

function build(passwordHash: string | null) {
  const users = {
    findHashById: vi
      .fn()
      .mockResolvedValue(passwordHash === null ? null : { passwordHash }),
  };
  const state = { deactivate: vi.fn().mockResolvedValue(undefined) };
  const service = new SelfDeactivationService(
    users as unknown as UserAccountService,
    state as unknown as AccountStateService,
  );
  return { service, users, state };
}

describe('SelfDeactivationService', () => {
  it('con la contraseña correcta desactiva la cuenta con by: self', async () => {
    const { service, state } = build(await bcrypt.hash(PASSWORD, 4));

    await service.deactivate(student, PASSWORD, actor);

    expect(state.deactivate).toHaveBeenCalledWith(USER_ID, actor, {
      by: 'self',
    });
  });

  it('con una contraseña incorrecta responde 403 INVALID_PASSWORD y no cambia nada', async () => {
    const { service, state } = build(await bcrypt.hash(PASSWORD, 4));

    await expect(
      service.deactivate(student, 'otra-clave-1', actor),
    ).rejects.toMatchObject({
      response: { code: 'INVALID_PASSWORD' },
      status: 403,
    });
    expect(state.deactivate).not.toHaveBeenCalled();
  });

  it('si la cuenta ya no existe responde igual que una contraseña incorrecta', async () => {
    const { service, state } = build(null);

    await expect(
      service.deactivate(student, PASSWORD, actor),
    ).rejects.toMatchObject({ response: { code: 'INVALID_PASSWORD' } });
    expect(state.deactivate).not.toHaveBeenCalled();
  });

  it('un admin no puede desactivarse y ni siquiera se mira su contraseña', async () => {
    const { service, users, state } = build(await bcrypt.hash(PASSWORD, 4));

    await expect(
      service.deactivate({ ...student, role: 'ADMIN' }, PASSWORD, actor),
    ).rejects.toMatchObject({
      response: { code: 'ADMIN_CANNOT_SELF_DEACTIVATE' },
      status: 403,
    });
    expect(users.findHashById).not.toHaveBeenCalled();
    expect(state.deactivate).not.toHaveBeenCalled();
  });
});
