import { vi } from 'vitest';
import type { ActorContext } from '../../common/actor/actor-context.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { AdminTargetService } from '../admin-users/admin-target.service.js';
import { AdminReportResolveService } from './admin-report-resolve.service.js';
import type { ReportClosingService } from './report-closing.service.js';
import type { ReportSanctionService } from './report-sanction.service.js';

// Resolver un reporte (spec 0009, decisión 33): el orden de los pasos y qué
// pasa si algo falla.
const ADMIN_ID = '01926f00-0000-7000-8000-00000000000a';
const REPORT_ID = '01926f00-0000-7000-8000-0000000000c1';
const USER_ID = '01926f00-0000-7000-8000-00000000000b';
const AUTHOR_ID = '01926f00-0000-7000-8000-00000000000d';
const TX = { marker: 'tx' };

const actor: ActorContext = {
  userId: ADMIN_ID,
  role: 'ADMIN',
  ip: null,
  userAgent: null,
};

const userReport = {
  id: REPORT_ID,
  status: 'PENDING',
  targetUserId: USER_ID,
  targetPostId: null,
  targetUser: { deactivatedAt: null },
  targetPost: null,
};

function build(report: object | null) {
  const prisma = {
    report: { findUnique: vi.fn().mockResolvedValue(report) },
    $transaction: vi.fn((work: (tx: unknown) => Promise<void>) => work(TX)),
  };
  const targets = { check: vi.fn().mockResolvedValue(undefined) };
  const closing = {
    close: vi.fn().mockResolvedValue(undefined),
    closeSiblings: vi.fn().mockResolvedValue(undefined),
  };
  const sanctions = {
    apply: vi.fn().mockResolvedValue(undefined),
    applyToAuthor: vi.fn().mockResolvedValue(undefined),
  };
  const service = new AdminReportResolveService(
    prisma as unknown as PrismaService,
    targets as unknown as AdminTargetService,
    closing as unknown as ReportClosingService,
    sanctions as unknown as ReportSanctionService,
  );
  return { service, targets, closing, sanctions, prisma };
}

describe('AdminReportResolveService.resolve', () => {
  it('desestimar cierra solo ese reporte y no toca al objetivo', async () => {
    const { service, closing, sanctions, targets } = build(userReport);

    await service.resolve(REPORT_ID, { action: 'DISMISS' }, actor);

    expect(closing.close).toHaveBeenCalledWith(
      TX,
      userReport,
      'DISMISSED',
      undefined,
      actor,
    );
    expect(closing.closeSiblings).not.toHaveBeenCalled();
    expect(sanctions.apply).not.toHaveBeenCalled();
    expect(targets.check).not.toHaveBeenCalled();
  });

  it('sancionar cierra el reporte, desactiva al objetivo y cierra los hermanos, en ese orden', async () => {
    const { service, closing, sanctions, targets } = build(userReport);
    const order: string[] = [];
    closing.close.mockImplementation(async () => void order.push('close'));
    sanctions.apply.mockImplementation(async () => void order.push('apply'));
    closing.closeSiblings.mockImplementation(
      async () => void order.push('siblings'),
    );

    await service.resolve(
      REPORT_ID,
      { action: 'DEACTIVATE_TARGET', note: 'Acoso comprobado' },
      actor,
    );

    expect(targets.check).toHaveBeenCalledWith(USER_ID, ADMIN_ID, {
      sanction: true,
    });
    expect(sanctions.apply).toHaveBeenCalledWith(
      TX,
      userReport,
      'Acoso comprobado',
      actor,
    );
    expect(order).toEqual(['close', 'apply', 'siblings']);
  });

  it('en una publicación revisa al autor, no al reportante', async () => {
    const postReport = {
      ...userReport,
      targetUserId: null,
      targetPostId: 'p1',
      targetUser: null,
      targetPost: { deactivatedAt: null, authorId: AUTHOR_ID },
    };
    const { service, targets } = build(postReport);

    await service.resolve(
      REPORT_ID,
      { action: 'DEACTIVATE_TARGET', note: 'Spam' },
      actor,
    );

    expect(targets.check).toHaveBeenCalledWith(AUTHOR_ID, ADMIN_ID, {
      sanction: true,
    });
  });

  it('una publicación borrada igual se cierra como sancionada, sin revisar a nadie', async () => {
    const deleted = {
      ...userReport,
      targetUserId: null,
      targetPostId: null,
      targetUser: null,
    };
    const { service, targets, closing } = build(deleted);

    await service.resolve(
      REPORT_ID,
      { action: 'DEACTIVATE_TARGET', note: 'Spam' },
      actor,
    );

    expect(targets.check).not.toHaveBeenCalled();
    expect(closing.close).toHaveBeenCalled();
  });

  it('sancionar sin nota o con menos de 3 caracteres responde 400 NOTE_REQUIRED', async () => {
    const { service, prisma } = build(userReport);

    for (const note of [undefined, 'ab']) {
      await expect(
        service.resolve(
          REPORT_ID,
          { action: 'DEACTIVATE_TARGET', note },
          actor,
        ),
      ).rejects.toMatchObject({
        status: 400,
        response: { code: 'NOTE_REQUIRED' },
      });
    }
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('un reporte que no existe responde 404 REPORT_NOT_FOUND', async () => {
    const { service } = build(null);

    await expect(
      service.resolve(REPORT_ID, { action: 'DISMISS' }, actor),
    ).rejects.toMatchObject({
      status: 404,
      response: { code: 'REPORT_NOT_FOUND' },
    });
  });

  it('uno ya cerrado responde 409 REPORT_ALREADY_RESOLVED', async () => {
    const { service, closing } = build({ ...userReport, status: 'DISMISSED' });

    await expect(
      service.resolve(REPORT_ID, { action: 'DISMISS' }, actor),
    ).rejects.toMatchObject({
      status: 409,
      response: { code: 'REPORT_ALREADY_RESOLVED' },
    });
    expect(closing.close).not.toHaveBeenCalled();
  });

  it('si no se puede sancionar al objetivo (admin o uno mismo) no abre la transacción', async () => {
    const { service, targets, prisma } = build(userReport);
    targets.check.mockRejectedValue(new Error('CANNOT_SANCTION_ADMIN'));

    await expect(
      service.resolve(
        REPORT_ID,
        { action: 'DEACTIVATE_TARGET', note: 'Spam' },
        actor,
      ),
    ).rejects.toThrow('CANNOT_SANCTION_ADMIN');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  describe('desactivar al autor desde una publicación (bug 1023)', () => {
    const postReport = {
      ...userReport,
      targetUserId: null,
      targetPostId: 'p1',
      targetUser: null,
      targetPost: {
        deactivatedAt: null,
        authorId: AUTHOR_ID,
        author: { deactivatedAt: null },
      },
    };

    it('cierra el reporte, desactiva al autor y cierra los pendientes de la publicación y del autor', async () => {
      const { service, closing, sanctions, targets } = build(postReport);
      const order: string[] = [];
      closing.close.mockImplementation(async () => void order.push('close'));
      sanctions.applyToAuthor.mockImplementation(
        async () => void order.push('author'),
      );
      closing.closeSiblings.mockImplementation(
        async (_tx: unknown, target: { targetUserId: string | null }) =>
          void order.push(target.targetUserId ? 'user' : 'post'),
      );

      await service.resolve(
        REPORT_ID,
        { action: 'DEACTIVATE_AUTHOR', note: 'Suplantación' },
        actor,
      );

      expect(targets.check).toHaveBeenCalledWith(AUTHOR_ID, ADMIN_ID, {
        sanction: true,
      });
      expect(sanctions.applyToAuthor).toHaveBeenCalledWith(
        TX,
        AUTHOR_ID,
        { deactivatedAt: null },
        'Suplantación',
        actor,
      );
      expect(sanctions.apply).not.toHaveBeenCalled();
      expect(order).toEqual(['close', 'author', 'post', 'user']);
    });

    it('en un reporte de usuario responde 400 NOT_A_POST_REPORT sin tocar nada', async () => {
      const { service, prisma } = build(userReport);

      await expect(
        service.resolve(
          REPORT_ID,
          { action: 'DEACTIVATE_AUTHOR', note: 'Suplantación' },
          actor,
        ),
      ).rejects.toMatchObject({
        status: 400,
        response: { code: 'NOT_A_POST_REPORT' },
      });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('si el autor es admin no abre la transacción', async () => {
      const { service, targets, prisma } = build(postReport);
      targets.check.mockRejectedValue(new Error('CANNOT_SANCTION_ADMIN'));

      await expect(
        service.resolve(
          REPORT_ID,
          { action: 'DEACTIVATE_AUTHOR', note: 'Suplantación' },
          actor,
        ),
      ).rejects.toThrow('CANNOT_SANCTION_ADMIN');
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });
});
