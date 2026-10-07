import type { Prisma } from '../../generated/prisma/client.js';
import { ACTIVE } from '../../common/soft-delete/soft-delete.js';

// Mis avisos activos; los de alguien que desactivó su cuenta dejan de salir.
// TODO(29): ocultar también los de alguien con quien hay un bloqueo vigente.
export function inboxWhere(recipientId: string): Prisma.NotificationWhereInput {
  return {
    recipientId,
    ...ACTIVE,
    OR: [{ actorId: null }, { actor: ACTIVE }],
  };
}

export const NOTIFICATION_ORDER = [
  { createdAt: 'desc' },
  { id: 'desc' },
] satisfies Prisma.NotificationOrderByWithRelationInput[];

export function afterNotification(
  createdAt: Date,
  id: string,
): Prisma.NotificationWhereInput {
  return {
    OR: [{ createdAt: { lt: createdAt } }, { createdAt, id: { lt: id } }],
  };
}

export const NOTIFICATION_VIEW_SELECT = {
  id: true,
  type: true,
  postId: true,
  storyId: true,
  conversationId: true,
  readAt: true,
  createdAt: true,
  actor: {
    select: {
      id: true,
      profile: { select: { handle: true, displayName: true } },
    },
  },
} satisfies Prisma.NotificationSelect;

export type NotificationViewRow = Prisma.NotificationGetPayload<{
  select: typeof NOTIFICATION_VIEW_SELECT;
}>;
