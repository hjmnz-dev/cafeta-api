import type { Prisma } from '../../generated/prisma/client.js';
import type { AdminReportsQueryDto } from './dto/admin-reports-query.dto.js';

const PERSON_SELECT = {
  id: true,
  profile: { select: { handle: true, displayName: true } },
} satisfies Prisma.UserSelect;

export const ADMIN_REPORT_SELECT = {
  id: true,
  targetType: true,
  targetUserId: true,
  targetPostId: true,
  targetSnapshot: true,
  reason: true,
  details: true,
  status: true,
  resolvedAt: true,
  resolutionNote: true,
  createdAt: true,
  reporter: { select: PERSON_SELECT },
  resolvedBy: { select: PERSON_SELECT },
  targetUser: { select: { ...PERSON_SELECT, deactivatedAt: true } },
  targetPost: {
    select: {
      content: true,
      deactivatedAt: true,
      archivedAt: true,
      author: { select: PERSON_SELECT },
    },
  },
} satisfies Prisma.ReportSelect;

export type AdminReportRow = Prisma.ReportGetPayload<{
  select: typeof ADMIN_REPORT_SELECT;
}>;

export const RELATED_REPORT_SELECT = {
  id: true,
  reason: true,
  details: true,
  createdAt: true,
  reporter: { select: PERSON_SELECT },
} satisfies Prisma.ReportSelect;

export type RelatedReportRow = Prisma.ReportGetPayload<{
  select: typeof RELATED_REPORT_SELECT;
}>;

export function adminReportsWhere(
  query: Pick<AdminReportsQueryDto, 'status' | 'targetType'>,
): Prisma.ReportWhereInput {
  return {
    status: query.status,
    ...(query.targetType ? { targetType: query.targetType } : {}),
  };
}

const isPending = (status: string) => status === 'PENDING';

// La cola de pendientes va del más antiguo (atender primero); los resueltos,
// del más reciente.
export function reportOrder(
  status: string,
): Prisma.ReportOrderByWithRelationInput[] {
  return isPending(status)
    ? [{ createdAt: 'asc' }, { id: 'asc' }]
    : [{ resolvedAt: 'desc' }, { id: 'desc' }];
}

export function afterReport(
  status: string,
  row: { createdAt: Date; resolvedAt: Date | null },
  id: string,
): Prisma.ReportWhereInput {
  if (isPending(status)) {
    return {
      OR: [
        { createdAt: { gt: row.createdAt } },
        { createdAt: row.createdAt, id: { gt: id } },
      ],
    };
  }
  const resolvedAt = row.resolvedAt ?? row.createdAt;
  return {
    OR: [{ resolvedAt: { lt: resolvedAt } }, { resolvedAt, id: { lt: id } }],
  };
}

// Los reportes que comparten objetivo con este; null si ya no tiene objetivo
// (publicación borrada): sin él, "targetPostId es null" coincidiría con todos
// los reportes de usuarios.
export function sameTarget(report: {
  targetUserId: string | null;
  targetPostId: string | null;
}): Prisma.ReportWhereInput | null {
  if (report.targetUserId) return { targetUserId: report.targetUserId };
  if (report.targetPostId) return { targetPostId: report.targetPostId };
  return null;
}
