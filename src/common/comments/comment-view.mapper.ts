import type { CommentPageDto, CommentViewDto } from './comment-view.dto.js';

// Convierte la clave guardada de la foto en un enlace de lectura.
export type UrlFor = (key: string) => string;

// La fila que devuelve COMMENT_VIEW_SELECT, sea de post_comments o de story_comments.
export interface CommentViewRow {
  id: string;
  content: string;
  createdAt: Date;
  editedAt: Date | null;
  author: {
    id: string;
    profile: {
      handle: string;
      displayName: string;
      avatarKey: string | null;
    } | null;
  };
}

export function toCommentView(
  row: CommentViewRow,
  viewerId: string,
  urlFor: UrlFor,
): CommentViewDto {
  const profile = row.author.profile;
  return {
    id: row.id,
    content: row.content,
    createdAt: row.createdAt.toISOString(),
    editedAt: row.editedAt?.toISOString() ?? null,
    author: {
      id: row.author.id,
      handle: profile?.handle ?? '',
      displayName: profile?.displayName ?? '',
      avatarUrl: profile?.avatarKey ? urlFor(profile.avatarKey) : null,
    },
    isMine: row.author.id === viewerId,
  };
}

// rows trae limit + 1: si sobra una, hay página siguiente.
export function toCommentPage(
  rows: CommentViewRow[],
  limit: number,
  viewerId: string,
  urlFor: UrlFor,
): CommentPageDto {
  const items = rows.slice(0, limit);
  const last = items.at(-1);
  return {
    items: items.map((row) => toCommentView(row, viewerId, urlFor)),
    nextCursor: rows.length > limit && last ? last.id : null,
  };
}
