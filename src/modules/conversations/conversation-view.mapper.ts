import type {
  ConversationViewRow,
  MessageViewRow,
} from './conversation-queries.js';
import type {
  ConversationPageDto,
  ConversationViewDto,
} from './dto/conversation-view.dto.js';
import type { MessagePageDto, MessageViewDto } from './dto/message-view.dto.js';

export function toMessageView(row: MessageViewRow): MessageViewDto {
  return {
    id: row.id,
    conversationId: row.conversationId,
    senderId: row.senderId,
    content: row.content,
    createdAt: row.createdAt.toISOString(),
    editedAt: row.editedAt?.toISOString() ?? null,
  };
}

// La vista depende de quién mira: la otra persona y mi propia marca de lectura.
export function toConversationView(
  row: ConversationViewRow,
  viewerId: string,
): ConversationViewDto {
  const viewerIsA = row.userAId === viewerId;
  const other = viewerIsA ? row.userB : row.userA;
  const lastReadAt = viewerIsA ? row.userALastReadAt : row.userBLastReadAt;
  const last = row.messages.at(0) ?? null;
  return {
    id: row.id,
    otherUser: {
      id: other.id,
      handle: other.profile?.handle ?? '',
      displayName: other.profile?.displayName ?? '',
      careerName: other.profile?.career?.name ?? null,
      verified: other.verificationStatus === 'VERIFIED',
    },
    lastMessage: last
      ? {
          id: last.id,
          senderId: last.senderId,
          content: last.content,
          createdAt: last.createdAt.toISOString(),
        }
      : null,
    unread:
      last !== null &&
      last.senderId !== viewerId &&
      (lastReadAt === null || last.createdAt > lastReadAt),
  };
}

// Se piden limit + 1 filas: si llegó la extra, hay otra página y el cursor es
// el id de la última que se devuelve.
function nextCursorOf(rows: { id: string }[], limit: number): string | null {
  const last = rows.slice(0, limit).at(-1);
  return rows.length > limit && last ? last.id : null;
}

export function toConversationPage(
  rows: ConversationViewRow[],
  limit: number,
  viewerId: string,
): ConversationPageDto {
  return {
    items: rows.slice(0, limit).map((row) => toConversationView(row, viewerId)),
    nextCursor: nextCursorOf(rows, limit),
  };
}

export function toMessagePage(
  rows: MessageViewRow[],
  limit: number,
): MessagePageDto {
  return {
    items: rows.slice(0, limit).map(toMessageView),
    nextCursor: nextCursorOf(rows, limit),
  };
}
