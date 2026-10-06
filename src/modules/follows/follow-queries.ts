import type { Prisma } from '../../generated/prisma/client.js';
import type {
  FollowRequestPageDto,
  FollowRequestViewDto,
  FollowUserPageDto,
  FollowUserViewDto,
} from './dto/follow-view.dto.js';

export const FOLLOW_ORDER = [
  { createdAt: 'desc' },
  { id: 'desc' },
] satisfies Prisma.FollowOrderByWithRelationInput[];

export function afterFollowCursor(
  createdAt: Date,
  id: string,
): Prisma.FollowWhereInput {
  return {
    OR: [{ createdAt: { lt: createdAt } }, { createdAt, id: { lt: id } }],
  };
}

export const USER_CARD_SELECT = {
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

export type UserCardRow = {
  id: string;
  verificationStatus: string;
  profile: {
    handle: string;
    displayName: string;
    avatarKey: string | null;
    career: { name: string } | null;
  } | null;
};

export function toFollowUserView(
  row: UserCardRow,
  urlFor: (key: string) => string,
): FollowUserViewDto {
  return {
    id: row.id,
    handle: row.profile?.handle ?? '',
    displayName: row.profile?.displayName ?? '',
    avatarUrl: row.profile?.avatarKey ? urlFor(row.profile.avatarKey) : null,
    careerName: row.profile?.career?.name ?? null,
    verified: row.verificationStatus === 'VERIFIED',
  };
}

export function toFollowUserPage(
  rows: { id: string; createdAt: Date; user: UserCardRow }[],
  limit: number,
  urlFor: (key: string) => string,
): FollowUserPageDto {
  const hasMore = rows.length > limit;
  const items = (hasMore ? rows.slice(0, limit) : rows).map((r) =>
    toFollowUserView(r.user, urlFor),
  );
  const last = items.length > 0 && hasMore ? rows[limit - 1] : null;
  return {
    items,
    nextCursor: last ? last.id : null,
  };
}

export function toFollowRequestPage(
  rows: { id: string; createdAt: Date; follower: UserCardRow }[],
  limit: number,
  urlFor: (key: string) => string,
): FollowRequestPageDto {
  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const items: FollowRequestViewDto[] = pageRows.map((r) => ({
    id: r.id,
    createdAt: r.createdAt,
    follower: toFollowUserView(r.follower, urlFor),
  }));
  const last = pageRows.length > 0 && hasMore ? pageRows[limit - 1] : null;
  return {
    items,
    nextCursor: last ? last.id : null,
  };
}
