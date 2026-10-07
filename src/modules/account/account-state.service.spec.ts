import { vi } from 'vitest';
import type { ActorContext } from '../../common/actor/actor-context.js';
import type { AuditService } from '../../common/audit/audit.service.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { SessionsService } from '../auth/sessions.service.js';
import type { UserAccountService } from '../users/user-account.service.js';
import { AccountStateService } from './account-state.service.js';

// La transacción de desactivar una cuenta (spec 0009, decisión 11): baja,
// sesiones cerradas y auditoría juntas, o ninguna.
const USER_ID = '01926f00-0000-7000-8000-000000000001';
const TX = { marker: 'tx' };

const actor: ActorContext = {
  userId: USER_ID,
  role: 'STUDENT',
  ip: '10.0.0.7',
  userAgent: 'vitest',
};

function build(changed: boolean) {
  const prisma = {
    $transaction: vi.fn((work: (tx: unknown) => Promise<void>) => work(TX)),
  };
  const users = { deactivate: vi.fn().mockResolvedValue(changed) };
  const sessions = { revokeAllForUser: vi.fn().mockResolvedValue(undefined) };
  const audit = { record: vi.fn().mockResolvedValue(undefined) };
  const service = new AccountStateService(
    prisma as unknown as PrismaService,
    users as unknown as UserAccountService,
    sessions as unknown as SessionsService,
    audit as unknown as AuditService,
  );
  return { service, users, sessions, audit };
}

describe('AccountStateService.deactivate', () => {
  it('da de baja, cierra las sesiones y audita, todo en la misma transacción', async () => {
    const { service, users, sessions, audit } = build(true);

    await service.deactivate(USER_ID, actor, { by: 'self' });

    expect(users.deactivate).toHaveBeenCalledWith(
      TX,
      USER_ID,
      expect.any(Date),
    );
    expect(sessions.revokeAllForUser).toHaveBeenCalledWith(
      TX,
      USER_ID,
      expect.any(Date),
    );
    expect(audit.record).toHaveBeenCalledWith(TX, {
      action: 'account.deactivate',
      entityType: 'user',
      entityId: USER_ID,
      actor,
      succeeded: true,
      metadata: { by: 'self' },
    });
  });

  it('guarda el motivo cuando lo da un admin', async () => {
    const { service, audit } = build(true);

    await service.deactivate(USER_ID, actor, {
      by: 'admin',
      reason: 'Acoso reiterado',
    });

    expect(audit.record).toHaveBeenCalledWith(
      TX,
      expect.objectContaining({
        metadata: { by: 'admin', reason: 'Acoso reiterado' },
      }),
    );
  });

  it('si ya estaba desactivada responde 409 y no cierra sesiones ni audita', async () => {
    const { service, sessions, audit } = build(false);

    await expect(
      service.deactivate(USER_ID, actor, { by: 'self' }),
    ).rejects.toMatchObject({
      response: { code: 'ALREADY_INACTIVE' },
      status: 409,
    });
    expect(sessions.revokeAllForUser).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });
});
