import { vi } from 'vitest';
import type { ActorContext } from '../../common/actor/actor-context.js';
import type { AuditService } from '../../common/audit/audit.service.js';
import type { AccountStateService } from '../account/account-state.service.js';
import type { PostModerationService } from '../posts/post-moderation.service.js';
import {
  ReportSanctionService,
  type SanctionTarget,
} from './report-sanction.service.js';

// Qué hace "Desactivar" sobre el objetivo (spec 0009, decisión 33).
const TX = { marker: 'tx' } as never;
const actor: ActorContext = {
  userId: 'admin',
  role: 'ADMIN',
  ip: null,
  userAgent: null,
};

const base: SanctionTarget = {
  id: 'r1',
  targetUserId: null,
  targetPostId: null,
  targetUser: null,
  targetPost: null,
};

function build(postChanged = true) {
  const accounts = { deactivateIn: vi.fn().mockResolvedValue(undefined) };
  const posts = { deactivate: vi.fn().mockResolvedValue(postChanged) };
  const audit = { record: vi.fn().mockResolvedValue(undefined) };
  const service = new ReportSanctionService(
    accounts as unknown as AccountStateService,
    posts as unknown as PostModerationService,
    audit as unknown as AuditService,
  );
  return { service, accounts, posts, audit };
}

describe('ReportSanctionService.apply', () => {
  it('desactiva la cuenta con by admin y el motivo', async () => {
    const { service, accounts } = build();

    await service.apply(
      TX,
      {
        ...base,
        targetUserId: 'u1',
        targetUser: { deactivatedAt: null },
      },
      'Acoso',
      actor,
    );

    expect(accounts.deactivateIn).toHaveBeenCalledWith(TX, 'u1', actor, {
      by: 'admin',
      reason: 'Acoso',
    });
  });

  it('si la cuenta ya estaba inactiva no cambia nada', async () => {
    const { service, accounts } = build();

    await service.apply(
      TX,
      {
        ...base,
        targetUserId: 'u1',
        targetUser: { deactivatedAt: new Date() },
      },
      'Acoso',
      actor,
    );

    expect(accounts.deactivateIn).not.toHaveBeenCalled();
  });

  it('desactiva la publicación y audita post.deactivate con el reporte', async () => {
    const { service, posts, audit } = build();

    await service.apply(
      TX,
      { ...base, targetPostId: 'p1', targetPost: { deactivatedAt: null } },
      'Spam',
      actor,
    );

    expect(posts.deactivate).toHaveBeenCalledWith(TX, 'p1', expect.any(Date));
    expect(audit.record).toHaveBeenCalledWith(
      TX,
      expect.objectContaining({
        action: 'post.deactivate',
        entityType: 'post',
        entityId: 'p1',
        metadata: { by: 'admin', reason: 'Spam', reportId: 'r1' },
      }),
    );
  });

  it('una publicación ya desactivada o borrada no cambia ni audita nada', async () => {
    const { service, posts, audit } = build();

    await service.apply(
      TX,
      {
        ...base,
        targetPostId: 'p1',
        targetPost: { deactivatedAt: new Date() },
      },
      'Spam',
      actor,
    );
    await service.apply(TX, base, 'Spam', actor);

    expect(posts.deactivate).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('si la baja no cambió ninguna fila (carrera) no audita', async () => {
    const { service, audit } = build(false);

    await service.apply(
      TX,
      { ...base, targetPostId: 'p1', targetPost: { deactivatedAt: null } },
      'Spam',
      actor,
    );

    expect(audit.record).not.toHaveBeenCalled();
  });
});
