import { vi } from 'vitest';
import type { PrismaService } from '../../prisma/prisma.service.js';
import { AdminTargetService } from './admin-target.service.js';

// A quién puede tocar un admin (spec 0009, decisión 32).
const ADMIN_ID = '01926f00-0000-7000-8000-00000000000a';
const OTHER_ID = '01926f00-0000-7000-8000-00000000000b';

function build(found: { id: string; role: 'STUDENT' | 'ADMIN' } | null) {
  const prisma = { user: { findUnique: vi.fn().mockResolvedValue(found) } };
  return new AdminTargetService(prisma as unknown as PrismaService);
}

describe('AdminTargetService.check', () => {
  it('deja pasar a un estudiante distinto del admin', async () => {
    const service = build({ id: OTHER_ID, role: 'STUDENT' });
    await expect(
      service.check(OTHER_ID, ADMIN_ID, { sanction: true }),
    ).resolves.toBeUndefined();
  });

  it('responde 404 USER_NOT_FOUND si la cuenta no existe', async () => {
    const service = build(null);
    await expect(
      service.check(OTHER_ID, ADMIN_ID, { sanction: false }),
    ).rejects.toMatchObject({
      status: 404,
      response: { code: 'USER_NOT_FOUND' },
    });
  });

  it('responde 403 CANNOT_ACT_ON_SELF si el admin se apunta a sí mismo', async () => {
    const service = build({ id: ADMIN_ID, role: 'ADMIN' });
    await expect(
      service.check(ADMIN_ID, ADMIN_ID, { sanction: false }),
    ).rejects.toMatchObject({
      status: 403,
      response: { code: 'CANNOT_ACT_ON_SELF' },
    });
  });

  it('responde 403 CANNOT_SANCTION_ADMIN al sancionar a otro admin', async () => {
    const service = build({ id: OTHER_ID, role: 'ADMIN' });
    await expect(
      service.check(OTHER_ID, ADMIN_ID, { sanction: true }),
    ).rejects.toMatchObject({
      status: 403,
      response: { code: 'CANNOT_SANCTION_ADMIN' },
    });
  });

  it('permite una acción que no es sanción sobre otro admin', async () => {
    const service = build({ id: OTHER_ID, role: 'ADMIN' });
    await expect(
      service.check(OTHER_ID, ADMIN_ID, { sanction: false }),
    ).resolves.toBeUndefined();
  });
});
