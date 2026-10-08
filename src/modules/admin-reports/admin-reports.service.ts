import { Injectable } from '@nestjs/common';
import type { ActorContext } from '../../common/actor/actor-context.js';
import { AuditService } from '../../common/audit/audit.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ActivityReportBuilder } from './activity-report.builder.js';
import { toCsv } from './csv.js';
import { ModerationReportBuilder } from './moderation-report.builder.js';
import type { ReportBuilder } from './report-builder.js';
import { parseReportRange } from './report-range.js';
import type { ReportKind, ReportTable } from './report-table.js';

export interface CsvFile {
  fileName: string;
  content: string;
}

type Format = 'json' | 'csv';

const FILE_SLUG: Record<ReportKind, string> = {
  activity: 'actividad',
  moderation: 'moderacion',
};

// Informes administrativos (spec 0008, decisión 35). Cada generación, en
// pantalla o como CSV, queda auditada con report.generate.
@Injectable()
export class AdminReportsService {
  private readonly builders: Record<ReportKind, ReportBuilder>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    activity: ActivityReportBuilder,
    moderation: ModerationReportBuilder,
  ) {
    this.builders = { activity, moderation };
  }

  generate(
    kind: ReportKind,
    range: { from: string; to: string },
    actor: ActorContext,
  ): Promise<ReportTable> {
    return this.build(kind, range, actor, 'json');
  }

  async download(
    kind: ReportKind,
    range: { from: string; to: string },
    actor: ActorContext,
  ): Promise<CsvFile> {
    const table = await this.build(kind, range, actor, 'csv');
    return {
      fileName: `cafeta-${FILE_SLUG[kind]}-${table.from}-${table.to}.csv`,
      content: toCsv(table),
    };
  }

  private async build(
    kind: ReportKind,
    { from, to }: { from: string; to: string },
    actor: ActorContext,
    format: Format,
  ): Promise<ReportTable> {
    const table = await this.builders[kind].build(parseReportRange(from, to));
    await this.audit.record(this.prisma, {
      action: 'report.generate',
      entityType: 'report',
      actor,
      succeeded: true,
      metadata: { kind, from, to, format, rows: table.rows.length },
    });
    return table;
  }
}
