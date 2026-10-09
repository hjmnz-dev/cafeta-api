import type { AdminUserRow } from './admin-user-queries.js';
import type {
  AdminUserPageDto,
  AdminUserViewDto,
} from './dto/admin-user-view.dto.js';

export function toAdminUserView(row: AdminUserRow): AdminUserViewDto {
  return {
    id: row.id,
    email: row.email,
    handle: row.profile?.handle ?? '',
    displayName: row.profile?.displayName ?? '',
    career: row.profile?.career?.name ?? null,
    role: row.role,
    active: row.deactivatedAt === null,
    deactivatedAt: row.deactivatedAt?.toISOString() ?? null,
    verificationStatus: row.verificationStatus,
    createdAt: row.createdAt.toISOString(),
  };
}

// Se piden limit + 1 filas: si llegó la extra, hay otra página.
export function toAdminUserPage(
  rows: AdminUserRow[],
  limit: number,
): AdminUserPageDto {
  const page = rows.slice(0, limit);
  const last = page.at(-1);
  return {
    items: page.map(toAdminUserView),
    nextCursor: rows.length > limit && last ? last.id : null,
  };
}
