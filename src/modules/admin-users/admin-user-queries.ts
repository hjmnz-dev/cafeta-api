import type { Prisma } from '../../generated/prisma/client.js';
import type { AdminUsersQueryDto } from './dto/admin-users-query.dto.js';

export const ADMIN_USER_ORDER = [
  { createdAt: 'desc' },
  { id: 'desc' },
] satisfies Prisma.UserOrderByWithRelationInput[];

export const ADMIN_USER_SELECT = {
  id: true,
  email: true,
  role: true,
  verificationStatus: true,
  deactivatedAt: true,
  createdAt: true,
  profile: {
    select: {
      handle: true,
      displayName: true,
      career: { select: { name: true } },
    },
  },
} satisfies Prisma.UserSelect;

export type AdminUserRow = Prisma.UserGetPayload<{
  select: typeof ADMIN_USER_SELECT;
}>;

type Filters = Pick<
  AdminUsersQueryDto,
  'search' | 'status' | 'verification' | 'role'
>;

// Los filtros de la lista se combinan con "y"; la búsqueda mira correo,
// usuario y nombre sin importar mayúsculas.
export function adminUsersWhere(filters: Filters): Prisma.UserWhereInput {
  const { search, status, verification, role } = filters;
  const clauses: Prisma.UserWhereInput[] = [];
  if (search) {
    const match = { contains: search, mode: 'insensitive' } as const;
    clauses.push({
      OR: [
        { email: match },
        { profile: { handle: match } },
        { profile: { displayName: match } },
      ],
    });
  }
  if (status) {
    clauses.push({ deactivatedAt: status === 'active' ? null : { not: null } });
  }
  if (verification) clauses.push({ verificationStatus: verification });
  if (role) clauses.push({ role });
  return clauses.length > 0 ? { AND: clauses } : {};
}

export function afterUserCursor(
  createdAt: Date,
  id: string,
): Prisma.UserWhereInput {
  return {
    OR: [{ createdAt: { lt: createdAt } }, { createdAt, id: { lt: id } }],
  };
}
