import type { FollowStatus } from '../../generated/prisma/client.js';
import {
  toFollowUserView,
  USER_CARD_SELECT,
  type UserCardRow,
} from '../follows/follow-queries.js';
import type { SearchUserViewDto } from './dto/search-user-view.dto.js';

// La tarjeta de persona más la privacidad y el seguimiento activo de quien busca.
export function searchUserSelect(viewerId: string) {
  return {
    ...USER_CARD_SELECT,
    profile: {
      select: { ...USER_CARD_SELECT.profile.select, visibility: true },
    },
    followers: {
      where: { followerId: viewerId, deactivatedAt: null },
      select: { status: true },
    },
  } as const;
}

export type SearchUserRow = UserCardRow & {
  profile:
    (NonNullable<UserCardRow['profile']> & { visibility: string }) | null;
  followers: { status: FollowStatus }[];
};

// La búsqueda ya dejó fuera a quien busca, a las cuentas inactivas y a los
// bloqueos, así que solo falta la regla de PRIVATE de canFollow (decisión 15).
export function toSearchUserView(
  row: SearchUserRow,
  urlFor: (key: string) => string,
): SearchUserViewDto {
  return {
    ...toFollowUserView(row, urlFor),
    followStatus: row.followers[0]?.status ?? 'NONE',
    canFollow: row.profile !== null && row.profile.visibility !== 'PRIVATE',
  };
}
