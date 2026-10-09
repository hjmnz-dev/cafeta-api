import { vi } from 'vitest';
import type { ActorContext } from '../../common/actor/actor-context.js';
import type { AccountStateService } from '../account/account-state.service.js';
import type { AdminTargetService } from './admin-target.service.js';
import { AdminUserActionsService } from './admin-user-actions.service.js';

// Desactivar y reactivar desde la consola (spec 0009, decisión 32): primero las
// reglas de a quién, luego el servicio de cuentas compartido.
const ADMIN_ID = '01926f00-0000-7000-8000-00000000000a';
const USER_ID = '01926f00-0000-7000-8000-00000000000b';

const actor: ActorContext = {
  userId: ADMIN_ID,
  role: 'ADMIN',
  ip: null,
  userAgent: null,
};

function build() {
  const targets = { check: vi.fn().mockResolvedValue(undefined) };
  const state = {
    deactivate: vi.fn().mockResolvedValue(undefined),
    reactivate: vi.fn().mockResolvedValue(undefined),
  };
  const service = new AdminUserActionsService(
    targets as unknown as AdminTargetService,
    state as unknown as AccountStateService,
  );
  return { service, targets, state };
}

describe('AdminUserActionsService', () => {
  it('desactiva como sanción y pasa el motivo con by admin', async () => {
    const { service, targets, state } = build();

    await service.deactivate(USER_ID, 'Spam repetido', actor);

    expect(targets.check).toHaveBeenCalledWith(USER_ID, ADMIN_ID, {
      sanction: true,
    });
    expect(state.deactivate).toHaveBeenCalledWith(USER_ID, actor, {
      by: 'admin',
      reason: 'Spam repetido',
    });
  });

  it('reactiva sin tratarlo como sanción', async () => {
    const { service, targets, state } = build();

    await service.reactivate(USER_ID, 'Fue un error', actor);

    expect(targets.check).toHaveBeenCalledWith(USER_ID, ADMIN_ID, {
      sanction: false,
    });
    expect(state.reactivate).toHaveBeenCalledWith(
      USER_ID,
      actor,
      'Fue un error',
    );
  });

  it('no desactiva si las reglas de a quién fallan', async () => {
    const { service, targets, state } = build();
    targets.check.mockRejectedValue(new Error('CANNOT_SANCTION_ADMIN'));

    await expect(service.deactivate(USER_ID, 'motivo', actor)).rejects.toThrow(
      'CANNOT_SANCTION_ADMIN',
    );
    expect(state.deactivate).not.toHaveBeenCalled();
  });
});
