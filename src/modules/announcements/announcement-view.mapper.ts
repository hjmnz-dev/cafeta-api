import type { AnnouncementRow } from './announcement-queries.js';
import type {
  AdminAnnouncementPageDto,
  AdminAnnouncementViewDto,
} from './dto/admin-announcement-view.dto.js';

type UrlFor = (key: string) => string;

export function toAnnouncementView(
  row: AnnouncementRow,
  urlFor: UrlFor,
): AdminAnnouncementViewDto {
  const profile = row.author.profile;
  return {
    id: row.id,
    content: row.content,
    createdAt: row.createdAt.toISOString(),
    editedAt: row.editedAt?.toISOString() ?? null,
    active: row.deactivatedAt === null && row.archivedAt === null,
    deactivatedAt: row.deactivatedAt?.toISOString() ?? null,
    archivedAt: row.archivedAt?.toISOString() ?? null,
    publishedBy: profile?.displayName || profile?.handle || '',
    media: row.media.map((m) => ({
      url: urlFor(m.storageKey),
      mediaType: m.mediaType,
      mimeType: m.mimeType,
    })),
    reactionCount: row._count.reactions,
    commentCount: row._count.comments,
  };
}

// Se piden limit + 1 filas: si llegó la extra, hay otra página.
export function toAnnouncementPage(
  rows: AnnouncementRow[],
  limit: number,
  urlFor: UrlFor,
): AdminAnnouncementPageDto {
  const items = rows.slice(0, limit);
  const last = items.at(-1);
  return {
    items: items.map((row) => toAnnouncementView(row, urlFor)),
    nextCursor: rows.length > limit && last ? last.id : null,
  };
}
