import { ConflictException, Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import type { ActorContext } from '../../common/actor/actor-context.js';
import { AuditService } from '../../common/audit/audit.service.js';
import { sameTarget } from './admin-report-queries.js';

export type ClosingStatus = 'SANCTIONED' | 'DISMISSED';

export interface ClosingTarget {
  id: string;
  targetUserId: string | null;
  targetPostId: string | null;
}

// Cerrar un reporte (spec 0009, decisión 33): estado final, quién y cuándo,
// la nota y pendingKey vacío para que se pueda volver a reportar (spec 0002).
// Todo dentro de la transacción de quien resuelve.
@Injectable()
export class ReportClosingService {
  constructor(private readonly audit: AuditService) {}

  // 409 si otro admin lo cerró primero: la condición status PENDING del
  // updateMany hace que solo uno gane.
  async close(
    tx: Prisma.TransactionClient,
    report: ClosingTarget,
    status: ClosingStatus,
    note: string | undefined,
    actor: ActorContext,
  ): Promise<void> {
    const { count } = await tx.report.updateMany({
      where: { id: report.id, status: 'PENDING' },
      data: closedData(status, note, actor),
    });
    if (count === 0) {
      throw new ConflictException({
        message: 'Este reporte ya fue resuelto',
        code: 'REPORT_ALREADY_RESOLVED',
      });
    }
    await this.record(tx, status, report.id, note, actor, {});
  }

  // Al sancionar, los demás pendientes sobre el mismo objetivo se cierran con
  // la misma nota, cada uno con su auditoría.
  async closeSiblings(
    tx: Prisma.TransactionClient,
    report: ClosingTarget,
    note: string | undefined,
    actor: ActorContext,
  ): Promise<void> {
    const same = sameTarget(report);
    if (!same) return;
    const siblings = await tx.report.findMany({
      where: { status: 'PENDING', id: { not: report.id }, ...same },
      select: { id: true },
    });
    if (siblings.length === 0) return;
    await tx.report.updateMany({
      where: { id: { in: siblings.map((s) => s.id) }, status: 'PENDING' },
      data: closedData('SANCTIONED', note, actor),
    });
    for (const sibling of siblings) {
      await this.record(tx, 'SANCTIONED', sibling.id, note, actor, {
        via: report.id,
      });
    }
  }

  private record(
    tx: Prisma.TransactionClient,
    status: ClosingStatus,
    reportId: string,
    note: string | undefined,
    actor: ActorContext,
    extra: Prisma.InputJsonObject,
  ): Promise<void> {
    return this.audit.record(tx, {
      action: status === 'SANCTIONED' ? 'report.sanction' : 'report.dismiss',
      entityType: 'report',
      entityId: reportId,
      actor,
      succeeded: true,
      metadata: { ...(note ? { note } : {}), ...extra },
    });
  }
}

function closedData(
  status: ClosingStatus,
  note: string | undefined,
  actor: ActorContext,
): Prisma.ReportUncheckedUpdateManyInput {
  return {
    status,
    pendingKey: null,
    resolvedById: actor.userId,
    resolvedAt: new Date(),
    resolutionNote: note ?? null,
  };
}
