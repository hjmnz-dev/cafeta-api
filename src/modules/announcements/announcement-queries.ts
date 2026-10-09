import type { Prisma } from '../../generated/prisma/client.js';
import { ACTIVE } from '../../common/soft-delete/soft-delete.js';

// Lista de la consola: todos los anuncios, desactivados y archivados incluidos.
export const ANNOUNCEMENT_WHERE = {
  type: 'ANNOUNCEMENT',
} satisfies Prisma.PostWhereInput;

export const ANNOUNCEMENT_SELECT = {
  id: true,
  content: true,
  createdAt: true,
  editedAt: true,
  deactivatedAt: true,
  archivedAt: true,
  media: {
    select: { storageKey: true, mediaType: true, mimeType: true },
    orderBy: { position: 'asc' },
  },
  author: {
    select: { profile: { select: { handle: true, displayName: true } } },
  },
  _count: {
    select: {
      reactions: { where: { deactivatedAt: null, user: ACTIVE } },
      comments: { where: { deactivatedAt: null, author: ACTIVE } },
    },
  },
} satisfies Prisma.PostSelect;

export type AnnouncementRow = Prisma.PostGetPayload<{
  select: typeof ANNOUNCEMENT_SELECT;
}>;
