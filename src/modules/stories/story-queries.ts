import type { Prisma } from '../../generated/prisma/client.js';
import { ACTIVE } from '../../common/soft-delete/soft-delete.js';

// Vigencia de una historia: 24 horas desde que se crea (spec 0008, decisión 22).
export const STORY_TTL_MS = 24 * 60 * 60 * 1000;

// Tope de historias que se leen de una vez: la bandeja no se pagina porque
// vence sola, pero no debe crecer sin límite.
export const TRAY_LIMIT = 300;

// Historia visible: con medio, sin desactivar, sin vencer y de autor activo.
// No hay ningún proceso que las borre: vencer es dejar de cumplir expiresAt.
export function liveStoryWhere(now: Date): Prisma.StoryWhereInput {
  return {
    deactivatedAt: null,
    expiresAt: { gt: now },
    mediaKey: { not: null },
    author: ACTIVE,
  };
}

// Bandeja: las mías y las de quienes sigo con seguimiento aceptado, siempre
// según VisibilityService (visibleAuthor, decisión 15).
export function trayWhere(
  viewerId: string,
  visibleAuthor: Prisma.UserWhereInput,
  now: Date,
): Prisma.StoryWhereInput {
  return {
    AND: [
      liveStoryWhere(now),
      {
        OR: [
          { authorId: viewerId },
          {
            author: {
              AND: [
                visibleAuthor,
                {
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
          },
        ],
      },
    ],
  };
}

// Lo que dibuja el visor.
export const STORY_VIEW_SELECT = {
  id: true,
  text: true,
  mediaKey: true,
  mediaType: true,
  mediaMimeType: true,
  createdAt: true,
  expiresAt: true,
  editedAt: true,
  author: {
    select: {
      id: true,
      profile: {
        select: { handle: true, displayName: true, avatarKey: true },
      },
    },
  },
} satisfies Prisma.StorySelect;

export type StoryViewRow = Prisma.StoryGetPayload<{
  select: typeof STORY_VIEW_SELECT;
}>;
