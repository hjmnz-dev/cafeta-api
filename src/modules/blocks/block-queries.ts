import type { Prisma } from '../../generated/prisma/client.js';
import type {
  BlockedUserPageDto,
  BlockedUserViewDto,
} from './dto/block-view.dto.js';

export const BLOCK_ORDER = [
  { createdAt: 'desc' },
  { id: 'desc' },
] satisfies Prisma.BlockOrderByWithRelationInput[];

export function afterBlockCursor(
  createdAt: Date,
  id: string,
): Prisma.BlockWhereInput {
  return {
    OR: [{ createdAt: { lt: createdAt } }, { createdAt, id: { lt: id } }],
  };
}

export const BLOCKED_USER_CARD_SELECT = {
  id: true,
  verificationStatus: true,
  profile: {
    select: {
      handle: true,
      displayName: true,
      avatarKey: true,
      career: { select: { name: true } },
    },
  },
} as const;

export type BlockedUserCardRow = {
  id: string;
  verificationStatus: string;
  profile: {
    handle: string;
    displayName: string;
    avatarKey: string | null;
    career: { name: string } | null;
  } | null;
};

export type BlockRow = {
  id: string;
  createdAt: Date;
  blocked: BlockedUserCardRow;
};

export function toBlockedUserView(
  row: BlockRow,
  urlFor: (key: string) => string,
): BlockedUserViewDto {
  return {
    id: row.blocked.id,
    handle: row.blocked.profile?.handle ?? '',
    displayName: row.blocked.profile?.displayName ?? '',
    avatarUrl: row.blocked.profile?.avatarKey
      ? urlFor(row.blocked.profile.avatarKey)
      : null,
    careerName: row.blocked.profile?.career?.name ?? null,
    verified: row.blocked.verificationStatus === 'VERIFIED',
    blockedAt: row.createdAt,
  };
}

export function toBlockedUserPage(
  rows: BlockRow[],
  limit: number,
  urlFor: (key: string) => string,
): BlockedUserPageDto {
  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const items = pageRows.map((r) => toBlockedUserView(r, urlFor));
  const last = pageRows.length > 0 && hasMore ? pageRows[limit - 1] : null;
  return {
    items,
    nextCursor: last ? last.id : null,
  };
}
