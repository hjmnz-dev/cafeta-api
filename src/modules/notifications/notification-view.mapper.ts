import type { NotificationViewRow } from './notification-queries.js';
import type {
  NotificationPageDto,
  NotificationViewDto,
} from './dto/notification-view.dto.js';

export function toNotificationView(
  row: NotificationViewRow,
  urlFor: (key: string) => string,
): NotificationViewDto {
  const avatarKey = row.actor?.profile?.avatarKey;
  return {
    id: row.id,
    type: row.type,
    actor: row.actor
      ? {
          id: row.actor.id,
          handle: row.actor.profile?.handle ?? '',
          displayName: row.actor.profile?.displayName ?? '',
          avatarUrl: avatarKey ? urlFor(avatarKey) : null,
        }
      : null,
    postId: row.postId,
    storyId: row.storyId,
    conversationId: row.conversationId,
    read: row.readAt !== null,
    createdAt: row.createdAt.toISOString(),
  };
}

// Se piden limit + 1 filas: si llegó la extra, hay otra página.
export function toNotificationPage(
  rows: NotificationViewRow[],
  limit: number,
  urlFor: (key: string) => string,
): NotificationPageDto {
  const page = rows.slice(0, limit);
  const last = page.at(-1);
  return {
    items: page.map((row) => toNotificationView(row, urlFor)),
    nextCursor: rows.length > limit && last ? last.id : null,
  };
}
