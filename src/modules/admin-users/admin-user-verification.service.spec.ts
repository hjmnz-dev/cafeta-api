import { vi } from 'vitest';
import type { ActorContext } from '../../common/actor/actor-context.js';
import type { AuditService } from '../../common/audit/audit.service.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { NotificationsService } from '../notifications/notifications.service.js';
import type { UserAccountService } from '../users/user-account.service.js';
import type { AdminTargetService } from './admin-target.service.js';
import { AdminUserVerificationService } from './admin-user-verification.service.js';

// Verificar o rechazar una cuenta (spec 0009, decisión 32): una sola decisión,
// con su bitácora y su aviso.
const ADMIN_ID = '01926f00-0000-7000-8000-00000000000a';
const USER_ID = '01926f00-0000-7000-8000-00000000000b';
const TX = { marker: 'tx' };

const actor: ActorContext = {
  userId: ADMIN_ID,
  role: 'ADMIN',
  ip: '10.0.0.7',
  userAgent: 'vitest',
};

function build(changed: boolean) {
  const prisma = {
    $transaction: vi.fn((work: (tx: unknown) => Promise<void>) => work(TX)),
  };
  const targets = { check: vi.fn().mockResolvedValue(undefined) };
  const users = { decideVerification: vi.fn().mockResolvedValue(changed) };
  const audit = { record: vi.fn().mockResolvedValue(undefined) };
  const notifications = { notify: vi.fn().mockResolvedValue(undefined) };
  const service = new AdminUserVerificationService(
    prisma as unknown as PrismaService,
    targets as unknown as AdminTargetService,
    users as unknown as UserAccountService,
    audit as unknown as AuditService,
    notifications as unknown as NotificationsService,
  );
  return { service, targets, users, audit, notifications };
}

describe('AdminUserVerificationService.decide', () => {
  it('verifica: guarda la decisión, audita account.verify y avisa', async () => {
    const { service, users, audit, notifications } = build(true);

    await service.decide(USER_ID, 'VERIFIED', actor);

    expect(users.decideVerification).toHaveBeenCalledWith(
      TX,
      USER_ID,
      'VERIFIED',
      expect.any(Date),
    );
    expect(audit.record).toHaveBeenCalledWith(
      TX,
      expect.objectContaining({
        action: 'account.verify',
        entityId: USER_ID,
        actor,
      }),
    );
    expect(notifications.notify).toHaveBeenCalledWith({
      recipientId: USER_ID,
      actorId: null,
      type: 'VERIFICATION_RESULT',
    });
  });

  it('rechaza: audita account.reject_verification', async () => {
    const { service, audit } = build(true);

    await service.decide(USER_ID, 'REJECTED', actor);

    expect(audit.record).toHaveBeenCalledWith(
      TX,
      expect.objectContaining({ action: 'account.reject_verification' }),
    );
  });

  it('responde 409 VERIFICATION_ALREADY_DECIDED y no audita ni avisa si ya había decisión', async () => {
    const { service, audit, notifications } = build(false);

    await expect(
      service.decide(USER_ID, 'VERIFIED', actor),
    ).rejects.toMatchObject({
      status: 409,
      response: { code: 'VERIFICATION_ALREADY_DECIDED' },
    });
    expect(audit.record).not.toHaveBeenCalled();
    expect(notifications.notify).not.toHaveBeenCalled();
  });

  it('no toca nada si el admin no puede actuar sobre esa cuenta', async () => {
    const { service, targets, users } = build(true);
    targets.check.mockRejectedValue(new Error('CANNOT_ACT_ON_SELF'));

    await expect(service.decide(ADMIN_ID, 'VERIFIED', actor)).rejects.toThrow(
      'CANNOT_ACT_ON_SELF',
    );
    expect(users.decideVerification).not.toHaveBeenCalled();
  });
});
