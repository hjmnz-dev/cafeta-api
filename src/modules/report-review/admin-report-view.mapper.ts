import type {
  AdminReportRow,
  RelatedReportRow,
} from './admin-report-queries.js';
import type {
  AdminReportDetailDto,
  AdminReportPageDto,
  AdminReportTargetDto,
  AdminReportViewDto,
  PostState,
  RelatedReportDto,
  ReportPersonDto,
} from './dto/admin-report-view.dto.js';

type Person = {
  id: string;
  profile: { handle: string; displayName: string } | null;
};

const toPerson = (user: Person): ReportPersonDto => ({
  id: user.id,
  handle: user.profile?.handle ?? '',
  displayName: user.profile?.displayName ?? '',
});

function postStateOf(
  post: NonNullable<AdminReportRow['targetPost']>,
): PostState {
  if (post.deactivatedAt) return 'DEACTIVATED';
  if (post.archivedAt) return 'ARCHIVED';
  return 'ACTIVE';
}

const EMPTY_TARGET: AdminReportTargetDto = {
  userId: null,
  postId: null,
  handle: null,
  displayName: null,
  active: null,
  snapshot: null,
  currentContent: null,
  postState: null,
};

export function toTarget(row: AdminReportRow): AdminReportTargetDto {
  if (row.targetType === 'USER') {
    const user = row.targetUser;
    return {
      ...EMPTY_TARGET,
      userId: row.targetUserId,
      handle: user?.profile?.handle ?? null,
      displayName: user?.profile?.displayName ?? null,
      active: user ? user.deactivatedAt === null : null,
    };
  }
  const post = row.targetPost;
  const author = post ? toPerson(post.author) : null;
  return {
    ...EMPTY_TARGET,
    postId: row.targetPostId,
    handle: author?.handle ?? null,
    displayName: author?.displayName ?? null,
    active: post ? post.deactivatedAt === null : null,
    snapshot: row.targetSnapshot,
    currentContent: post?.content ?? null,
    // Sin fila ya no existe: el autor la borró después del reporte.
    postState: post ? postStateOf(post) : 'DELETED',
  };
}

export function toAdminReportView(
  row: AdminReportRow,
  otherPending: number,
): AdminReportViewDto {
  return {
    id: row.id,
    targetType: row.targetType,
    reason: row.reason,
    details: row.details,
    status: row.status,
    reporter: toPerson(row.reporter),
    target: toTarget(row),
    otherPending,
    resolvedBy: row.resolvedBy ? toPerson(row.resolvedBy) : null,
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    resolutionNote: row.resolutionNote,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toAdminReportDetail(
  row: AdminReportRow,
  related: RelatedReportRow[],
): AdminReportDetailDto {
  return {
    ...toAdminReportView(row, related.length),
    related: related.map((r): RelatedReportDto => ({
      id: r.id,
      reason: r.reason,
      details: r.details,
      reporter: toPerson(r.reporter),
      createdAt: r.createdAt.toISOString(),
    })),
  };
}

// Se piden limit + 1 filas: si llegó la extra, hay otra página.
export function toAdminReportPage(
  rows: AdminReportRow[],
  limit: number,
  pendingOf: (row: AdminReportRow) => number,
): AdminReportPageDto {
  const page = rows.slice(0, limit);
  const last = page.at(-1);
  return {
    items: page.map((row) => toAdminReportView(row, pendingOf(row))),
    nextCursor: rows.length > limit && last ? last.id : null,
  };
}
