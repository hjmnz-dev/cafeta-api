import { Injectable } from '@nestjs/common';
import type { ReportReason } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { ReportBuilder } from './report-builder.js';
import type { ReportRange } from './report-range.js';
import type { ReportCell, ReportTable } from './report-table.js';

const REASONS: readonly { value: ReportReason; label: string }[] = [
  { value: 'SPAM', label: 'Spam' },
  { value: 'HARASSMENT', label: 'Acoso' },
  { value: 'INAPPROPRIATE', label: 'Contenido inapropiado' },
  { value: 'IMPERSONATION', label: 'Suplantación de identidad' },
  { value: 'OTHER', label: 'Otro' },
];

interface ReasonTotals {
  created: number;
  pending: number;
  sanctioned: number;
  dismissed: number;
}

const EMPTY_TOTALS: ReasonTotals = {
  created: 0,
  pending: 0,
  sanctioned: 0,
  dismissed: 0,
};

// Informe de Moderación, por motivo. Creados y Pendientes salen de los reportes
// creados en el rango; Sancionados y Descartados, de los resueltos en el rango
// (resolved_at). Una sanción aplicada es un reporte que terminó en SANCTIONED.
@Injectable()
export class ModerationReportBuilder implements ReportBuilder {
  readonly kind = 'moderation' as const;
  readonly title = 'Informe de moderación';

  constructor(private readonly prisma: PrismaService) {}

  async build(range: ReportRange): Promise<ReportTable> {
    const totals = await this.totalsByReason(range);
    const rows = REASONS.map(({ value, label }) =>
      toRow(label, totals.get(value) ?? EMPTY_TOTALS),
    );
    const all = sumTotals([...totals.values()]);
    rows.push(toRow('Total', all));

    return {
      kind: this.kind,
      title: this.title,
      from: range.from,
      to: range.to,
      columns: [
        'Motivo',
        'Creados',
        'Resueltos',
        'Sancionados',
        'Descartados',
        'Pendientes',
      ],
      rows,
      isEmpty: all.created + all.sanctioned + all.dismissed === 0,
    };
  }

  private async totalsByReason({ startsAt, endsAt }: ReportRange) {
    const [created, resolved] = await Promise.all([
      this.prisma.report.groupBy({
        by: ['reason', 'status'],
        where: { createdAt: { gte: startsAt, lt: endsAt } },
        _count: { _all: true },
      }),
      this.prisma.report.groupBy({
        by: ['reason', 'status'],
        where: {
          resolvedAt: { gte: startsAt, lt: endsAt },
          status: { in: ['SANCTIONED', 'DISMISSED'] },
        },
        _count: { _all: true },
      }),
    ]);

    const totals = new Map<ReportReason, ReasonTotals>();
    const entryOf = (reason: ReportReason) => {
      const entry = totals.get(reason) ?? { ...EMPTY_TOTALS };
      totals.set(reason, entry);
      return entry;
    };
    for (const { reason, status, _count } of created) {
      const entry = entryOf(reason);
      entry.created += _count._all;
      if (status === 'PENDING') entry.pending += _count._all;
    }
    for (const { reason, status, _count } of resolved) {
      const entry = entryOf(reason);
      if (status === 'SANCTIONED') entry.sanctioned += _count._all;
      else entry.dismissed += _count._all;
    }
    return totals;
  }
}

function sumTotals(list: ReasonTotals[]): ReasonTotals {
  return list.reduce(
    (acc, t) => ({
      created: acc.created + t.created,
      pending: acc.pending + t.pending,
      sanctioned: acc.sanctioned + t.sanctioned,
      dismissed: acc.dismissed + t.dismissed,
    }),
    EMPTY_TOTALS,
  );
}

function toRow(label: string, t: ReasonTotals): ReportCell[] {
  return [
    label,
    t.created,
    t.sanctioned + t.dismissed,
    t.sanctioned,
    t.dismissed,
    t.pending,
  ];
}
