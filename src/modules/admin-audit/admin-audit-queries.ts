import type { Prisma } from '../../generated/prisma/client.js';
import { parseAuditRange } from './audit-range.js';
import type { AdminAuditQueryDto } from './dto/admin-audit-query.dto.js';

export const AUDIT_ORDER = [
  { createdAt: 'desc' },
  { id: 'desc' },
] satisfies Prisma.AuditLogOrderByWithRelationInput[];

// El userAgent no se pide: la consola no lo muestra.
export const AUDIT_SELECT = {
  id: true,
  createdAt: true,
  actorRole: true,
  action: true,
  entityType: true,
  entityId: true,
  succeeded: true,
  metadata: true,
  ip: true,
  actor: {
    select: { id: true, email: true, profile: { select: { handle: true } } },
  },
} satisfies Prisma.AuditLogSelect;

export type AuditRow = Prisma.AuditLogGetPayload<{
  select: typeof AUDIT_SELECT;
}>;

type Filters = Pick<
  AdminAuditQueryDto,
  'actor' | 'action' | 'entityType' | 'succeeded' | 'from' | 'to'
>;

// Los filtros se combinan con "y"; `actor` mira correo y usuario sin importar
// mayúsculas.
export function auditWhere(filters: Filters): Prisma.AuditLogWhereInput {
  const { actor, action, entityType, succeeded, from, to } = filters;
  const clauses: Prisma.AuditLogWhereInput[] = [];
  if (actor) {
    const match = { contains: actor, mode: 'insensitive' } as const;
    clauses.push({
      actor: { OR: [{ email: match }, { profile: { handle: match } }] },
    });
  }
  if (action) clauses.push({ action });
  if (entityType) clauses.push({ entityType });
  if (succeeded !== undefined) clauses.push({ succeeded });
  const range = parseAuditRange(from, to);
  if (range.gte || range.lt) clauses.push({ createdAt: range });
  return clauses.length > 0 ? { AND: clauses } : {};
}

export function afterAuditCursor(
  createdAt: Date,
  id: string,
): Prisma.AuditLogWhereInput {
  return {
    OR: [{ createdAt: { lt: createdAt } }, { createdAt, id: { lt: id } }],
  };
}
