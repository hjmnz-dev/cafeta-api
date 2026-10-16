import type { Prisma } from '../../generated/prisma/client.js';
import { ACTIVE } from '../../common/soft-delete/soft-delete.js';

// Publicación visible: ni archivada ni desactivada, y con autor activo (spec 0005).
export const VISIBLE_POST = {
  deactivatedAt: null,
  archivedAt: null,
  author: ACTIVE,
} satisfies Prisma.PostWhereInput;

// De la más reciente a la más antigua; el id desempata las del mismo instante.
export const POST_ORDER = [
  { createdAt: 'desc' },
  { id: 'desc' },
] satisfies Prisma.PostOrderByWithRelationInput[];

// "Para ti" (sin careerId): mías, de quienes sigo con ACCEPTED activo y anuncios.
// Pestaña de carrera: todas las de autores con esa carrera, los siga o no, y
// los anuncios, que son de toda la comunidad (spec 0009, decisión 36).
// visibleAuthor es el filtro de VisibilityService (decisión 15); los anuncios
// institucionales no dependen de la privacidad de quien los publica.
export function feedWhere(
  userId: string,
  visibleAuthor: Prisma.UserWhereInput,
  careerId?: string,
): Prisma.PostWhereInput {
  const visible: Prisma.PostWhereInput = {
    OR: [{ type: 'ANNOUNCEMENT' }, { author: visibleAuthor }],
  };
  if (careerId) {
    return {
      AND: [
        VISIBLE_POST,
        visible,
        {
          OR: [{ type: 'ANNOUNCEMENT' }, { author: { profile: { careerId } } }],
        },
      ],
    };
  }
  return {
    AND: [
      VISIBLE_POST,
      visible,
      {
        OR: [
          { authorId: userId },
          {
            author: {
              followers: {
                some: {
                  followerId: userId,
                  status: 'ACCEPTED',
                  deactivatedAt: null,
                },
              },
            },
          },
          { type: 'ANNOUNCEMENT' },
        ],
      },
    ],
  };
}

// Mis publicaciones fuera de la vista pública: archivadas (HU21) o desactivadas
// (HU23). Solo del autor, y solo mientras su cuenta siga activa.
export function hiddenWhere(authorId: string): Prisma.PostWhereInput {
  return {
    authorId,
    author: ACTIVE,
    OR: [{ archivedAt: { not: null } }, { deactivatedAt: { not: null } }],
  };
}

export function authorWhere(authorId: string): Prisma.PostWhereInput {
  return { AND: [VISIBLE_POST, { authorId }] };
}

// Recursos del perfil (bug 1029): las publicaciones con un PDF adjunto.
export const RESOURCE_POST = {
  media: { some: { mediaType: 'DOCUMENT' } },
} satisfies Prisma.PostWhereInput;

// Lo que viene después de la publicación del cursor en el orden de POST_ORDER.
export function afterCursor(
  createdAt: Date,
  id: string,
): Prisma.PostWhereInput {
  return {
    OR: [{ createdAt: { lt: createdAt } }, { createdAt, id: { lt: id } }],
  };
}

// Lo que dibuja la tarjeta para quien mira (viewerId). Los conteos solo suman
// filas activas de usuarios activos; myReaction y savedByMe son mis filas
// activas, si las hay.
export const postViewSelect = (viewerId: string) =>
  ({
    id: true,
    type: true,
    content: true,
    location: true,
    createdAt: true,
    editedAt: true,
    archivedAt: true,
    deactivatedAt: true,
    eventStartsAt: true,
    eventLocation: true,
    codeSnippet: true,
    groupName: true,
    groupSpots: true,
    media: {
      select: { storageKey: true, mediaType: true, mimeType: true },
      orderBy: { position: 'asc' },
    },
    author: {
      select: {
        id: true,
        verificationStatus: true,
        profile: {
          select: {
            handle: true,
            displayName: true,
            career: { select: { name: true } },
          },
        },
      },
    },
    reactions: {
      where: { userId: viewerId, deactivatedAt: null },
      select: { type: true },
      take: 1,
    },
    savedBy: {
      where: { userId: viewerId, deactivatedAt: null },
      select: { id: true },
      take: 1,
    },
    _count: {
      select: {
        reactions: { where: { deactivatedAt: null, user: ACTIVE } },
        comments: { where: { deactivatedAt: null, author: ACTIVE } },
      },
    },
  }) satisfies Prisma.PostSelect;

export type PostViewRow = Prisma.PostGetPayload<{
  select: ReturnType<typeof postViewSelect>;
}>;
