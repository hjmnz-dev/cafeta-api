import type { Prisma } from '../../generated/prisma/client.js';
import { ACTIVE } from '../../common/soft-delete/soft-delete.js';

// Par ordenado de la conversación (spec 0002): el id menor como texto en
// minúsculas va en user_a_id, igual que el orden del tipo uuid de PostgreSQL.
export function orderedPair(
  first: string,
  second: string,
): { userAId: string; userBId: string } {
  const [userAId, userBId] = [first.toLowerCase(), second.toLowerCase()].sort();
  return { userAId, userBId };
}

// Conversaciones donde participo, la otra persona sigue activa y no hay un
// bloqueo mutuo activo (decisión 29).
export function participantWhere(
  userId: string,
): Prisma.ConversationWhereInput {
  const notBlockedWithViewer = {
    blocksMade: { none: { blockedId: userId, deactivatedAt: null } },
    blocksReceived: { none: { blockerId: userId, deactivatedAt: null } },
  };
  return {
    OR: [
      {
        userAId: userId,
        userB: {
          AND: [ACTIVE, notBlockedWithViewer],
        },
      },
      {
        userBId: userId,
        userA: {
          AND: [ACTIVE, notBlockedWithViewer],
        },
      },
    ],
  };
}

// La bandeja solo muestra conversaciones con al menos un mensaje.
export function inboxWhere(userId: string): Prisma.ConversationWhereInput {
  return { AND: [participantWhere(userId), { lastMessageAt: { not: null } }] };
}

export const CONVERSATION_ORDER = [
  { lastMessageAt: 'desc' },
  { id: 'desc' },
] satisfies Prisma.ConversationOrderByWithRelationInput[];

export function afterConversation(
  lastMessageAt: Date,
  id: string,
): Prisma.ConversationWhereInput {
  return {
    OR: [
      { lastMessageAt: { lt: lastMessageAt } },
      { lastMessageAt, id: { lt: id } },
    ],
  };
}

export const MESSAGE_ORDER = [
  { createdAt: 'desc' },
  { id: 'desc' },
] satisfies Prisma.MessageOrderByWithRelationInput[];

export function afterMessage(
  createdAt: Date,
  id: string,
): Prisma.MessageWhereInput {
  return {
    OR: [{ createdAt: { lt: createdAt } }, { createdAt, id: { lt: id } }],
  };
}

export const MESSAGE_VIEW_SELECT = {
  id: true,
  conversationId: true,
  senderId: true,
  content: true,
  createdAt: true,
  editedAt: true,
} satisfies Prisma.MessageSelect;

export type MessageViewRow = Prisma.MessageGetPayload<{
  select: typeof MESSAGE_VIEW_SELECT;
}>;

const USER_VIEW_SELECT = {
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
} satisfies Prisma.UserSelect;

export const CONVERSATION_VIEW_SELECT = {
  id: true,
  userAId: true,
  userBId: true,
  userALastReadAt: true,
  userBLastReadAt: true,
  userA: { select: USER_VIEW_SELECT },
  userB: { select: USER_VIEW_SELECT },
  messages: {
    where: ACTIVE,
    orderBy: MESSAGE_ORDER,
    take: 1,
    select: { id: true, senderId: true, content: true, createdAt: true },
  },
} satisfies Prisma.ConversationSelect;

export type ConversationViewRow = Prisma.ConversationGetPayload<{
  select: typeof CONVERSATION_VIEW_SELECT;
}>;
