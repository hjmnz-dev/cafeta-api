import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  ADMIN_REPORT_SELECT,
  adminReportsWhere,
  afterReport,
  RELATED_REPORT_SELECT,
  reportOrder,
  sameTarget,
  type AdminReportRow,
} from './admin-report-queries.js';
import {
  toAdminReportDetail,
  toAdminReportPage,
} from './admin-report-view.mapper.js';
import type {
  AdminReportDetailDto,
  AdminReportPageDto,
} from './dto/admin-report-view.dto.js';
import type { AdminReportsQueryDto } from './dto/admin-reports-query.dto.js';

const RELATED_LIMIT = 50;

// La cola de reportes de la consola y el detalle de cada uno (HU51, HU52). El
// admin lee el objetivo directo, sin VisibilityService: tiene que ver lo
// reportado aunque esté bloqueado o archivado.
@Injectable()
export class AdminReportsReadService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: AdminReportsQueryDto): Promise<AdminReportPageDto> {
    const where = adminReportsWhere(query);
    const after = query.cursor
      ? await this.afterOf(query.cursor, query.status, where)
      : null;
    const rows = await this.prisma.report.findMany({
      where: after ? { AND: [where, after] } : where,
      orderBy: reportOrder(query.status),
      take: query.limit + 1,
      select: ADMIN_REPORT_SELECT,
    });
    const pending = await this.pendingByTarget(rows.slice(0, query.limit));
    return toAdminReportPage(
      rows,
      query.limit,
      (row) => pending.get(targetKey(row)) ?? 0,
    );
  }

  async detail(id: string): Promise<AdminReportDetailDto> {
    const row = await this.prisma.report.findUnique({
      where: { id },
      select: ADMIN_REPORT_SELECT,
    });
    if (!row) {
      throw new NotFoundException({
        message: 'No encontramos ese reporte',
        code: 'REPORT_NOT_FOUND',
      });
    }
    const same = sameTarget(row);
    const related = same
      ? await this.prisma.report.findMany({
          where: { status: 'PENDING', id: { not: id }, ...same },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          take: RELATED_LIMIT,
          select: RELATED_REPORT_SELECT,
        })
      : [];
    return toAdminReportDetail(row, related);
  }

  // Reportes pendientes por objetivo en una sola consulta por tipo; a cada
  // fila se le descuenta ella misma si también está pendiente.
  private async pendingByTarget(
    rows: AdminReportRow[],
  ): Promise<Map<string, number>> {
    const userIds = rows.flatMap((r) =>
      r.targetUserId ? [r.targetUserId] : [],
    );
    const postIds = rows.flatMap((r) =>
      r.targetPostId ? [r.targetPostId] : [],
    );
    const [byUser, byPost] = await Promise.all([
      userIds.length
        ? this.prisma.report.groupBy({
            by: ['targetUserId'],
            where: { status: 'PENDING', targetUserId: { in: userIds } },
            _count: { _all: true },
          })
        : [],
      postIds.length
        ? this.prisma.report.groupBy({
            by: ['targetPostId'],
            where: { status: 'PENDING', targetPostId: { in: postIds } },
            _count: { _all: true },
          })
        : [],
    ]);
    const totals = new Map<string, number>();
    for (const g of byUser) totals.set(`U${g.targetUserId}`, g._count._all);
    for (const g of byPost) totals.set(`P${g.targetPostId}`, g._count._all);
    const result = new Map<string, number>();
    for (const row of rows) {
      const own = row.status === 'PENDING' ? 1 : 0;
      result.set(
        targetKey(row),
        Math.max(0, (totals.get(targetKey(row)) ?? 0) - own),
      );
    }
    return result;
  }

  private async afterOf(
    cursor: string,
    status: string,
    where: ReturnType<typeof adminReportsWhere>,
  ) {
    const row = await this.prisma.report.findFirst({
      where: { AND: [{ id: cursor }, where] },
      select: { createdAt: true, resolvedAt: true },
    });
    if (!row) {
      throw new BadRequestException({
        message: 'El cursor no corresponde a ningún elemento de esta lista',
        code: 'INVALID_CURSOR',
      });
    }
    return afterReport(status, row, cursor);
  }
}

// Una clave por objetivo; una publicación borrada ya no tiene objetivo y no cuenta.
const targetKey = (row: {
  targetUserId: string | null;
  targetPostId: string | null;
  id: string;
}) =>
  row.targetUserId
    ? `U${row.targetUserId}`
    : row.targetPostId
      ? `P${row.targetPostId}`
      : `X${row.id}`;
