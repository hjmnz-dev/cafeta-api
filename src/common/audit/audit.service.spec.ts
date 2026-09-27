import type { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService, type AuditEntry } from './audit.service.js';

const entry: AuditEntry = {
  action: 'post.deactivate',
  entityType: 'post',
  entityId: '01926f00-0000-7000-8000-000000000065',
  actor: {
    userId: '01926f00-0000-7000-8000-000000000001',
    role: 'ADMIN',
    ip: '10.0.0.7',
    userAgent: 'vitest',
  },
  succeeded: true,
  metadata: { by: 'admin', reason: 'Contenido ofensivo' },
};

const row = {
  action: 'post.deactivate',
  entityType: 'post',
  entityId: '01926f00-0000-7000-8000-000000000065',
  succeeded: true,
  metadata: { by: 'admin', reason: 'Contenido ofensivo' },
  actorId: '01926f00-0000-7000-8000-000000000001',
  actorRole: 'ADMIN',
  ip: '10.0.0.7',
  userAgent: 'vitest',
};

function prismaDouble(create: ReturnType<typeof vi.fn>) {
  return { auditLog: { create } } as unknown as PrismaService;
}

describe('AuditService', () => {
  it('record escribe la fila con el cliente de la transacción', async () => {
    const txCreate = vi.fn().mockResolvedValue({});
    const service = new AuditService(prismaDouble(vi.fn()));
    await service.record({ auditLog: { create: txCreate } } as never, entry);
    expect(txCreate).toHaveBeenCalledWith({ data: row });
  });

  it('record deja pasar el error para que la transacción se deshaga', async () => {
    const txCreate = vi.fn().mockRejectedValue(new Error('caída'));
    const service = new AuditService(prismaDouble(vi.fn()));
    await expect(
      service.record({ auditLog: { create: txCreate } } as never, entry),
    ).rejects.toThrow('caída');
  });

  it('recordStandalone nunca lanza, aunque la base falle', async () => {
    const create = vi.fn().mockRejectedValue(new Error('caída'));
    const service = new AuditService(prismaDouble(create));
    await expect(service.recordStandalone(entry)).resolves.toBeUndefined();
    expect(create).toHaveBeenCalledWith({ data: row });
  });
});
