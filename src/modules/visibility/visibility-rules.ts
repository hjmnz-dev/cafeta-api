import type {
  FollowStatus,
  Prisma,
  ProfileVisibility,
} from '../../generated/prisma/client.js';
import { ACTIVE } from '../../common/soft-delete/soft-delete.js';

// Lo que hace falta saber de la relación entre quien mira y el dueño.
export interface VisibilityFacts {
  isSelf: boolean;
  ownerActive: boolean;
  visibility: ProfileVisibility;
  // Estado del seguimiento activo de quien mira hacia el dueño; null si no lo sigue.
  followStatus: FollowStatus | null;
  // Un bloqueo activo en cualquiera de las dos direcciones (decisión 29).
  blocked: boolean;
}

// El perfil existe para quien mira: cuenta activa y sin bloqueo entre los dos.
export function canSeeProfile(facts: VisibilityFacts): boolean {
  return facts.isSelf || (facts.ownerActive && !facts.blocked);
}

// La regla de la decisión 15: PUBLIC lo ve todo el mundo, FOLLOWERS solo quien
// sigue con ACCEPTED y PRIVATE solo el dueño.
export function canSeeContent(facts: VisibilityFacts): boolean {
  if (facts.isSelf) return true;
  if (!canSeeProfile(facts)) return false;
  if (facts.visibility === 'PUBLIC') return true;
  if (facts.visibility === 'FOLLOWERS')
    return facts.followStatus === 'ACCEPTED';
  return false;
}

// Solo se puede seguir a otro, que no sea PRIVATE y que se vea (decisión 15).
export function canFollow(facts: VisibilityFacts): boolean {
  return (
    !facts.isSelf && canSeeProfile(facts) && facts.visibility !== 'PRIVATE'
  );
}

function notBlockedWith(viewerId: string): Prisma.UserWhereInput {
  return {
    blocksMade: { none: { blockedId: viewerId, deactivatedAt: null } },
    blocksReceived: { none: { blockerId: viewerId, deactivatedAt: null } },
  };
}

// La misma regla de canSeeContent como filtro de Prisma sobre el autor, para las
// listas (feed, perfil, historias, búsqueda, comentarios).
export function contentVisibleTo(viewerId: string): Prisma.UserWhereInput {
  return {
    OR: [
      { id: viewerId },
      {
        AND: [
          ACTIVE,
          notBlockedWith(viewerId),
          {
            OR: [
              { profile: { visibility: 'PUBLIC' } },
              {
                profile: { visibility: 'FOLLOWERS' },
                followers: {
                  some: {
                    followerId: viewerId,
                    status: 'ACCEPTED',
                    deactivatedAt: null,
                  },
                },
              },
            ],
          },
        ],
      },
    ],
  };
}
