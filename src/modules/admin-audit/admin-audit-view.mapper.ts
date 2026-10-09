import type { AuditRow } from './admin-audit-queries.js';
import type {
  AdminAuditEntryDto,
  AdminAuditPageDto,
} from './dto/admin-audit-view.dto.js';

export function toAuditEntry(row: AuditRow): AdminAuditEntryDto {
  return {
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    actor: row.actor
      ? {
          id: row.actor.id,
          email: row.actor.email,
          handle: row.actor.profile?.handle ?? null,
          role: row.actorRole,
        }
      : null,
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId,
    succeeded: row.succeeded,
    metadata: (row.metadata as Record<string, unknown> | null) ?? null,
    ip: row.ip,
  };
}

// Se piden limit + 1 filas: si llegó la extra, hay otra página.
export function toAuditPage(
  rows: AuditRow[],
  limit: number,
): AdminAuditPageDto {
  const page = rows.slice(0, limit);
  const last = page.at(-1);
  return {
    items: page.map(toAuditEntry),
    nextCursor: rows.length > limit && last ? last.id : null,
  };
}
