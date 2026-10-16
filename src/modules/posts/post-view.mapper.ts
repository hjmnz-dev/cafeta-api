import type { PostPageDto } from './dto/post-page.dto.js';
import type { PostViewDto } from './dto/post-view.dto.js';
import type { PostViewRow } from './post-queries.js';

const iso = (date: Date | null): string | null => date?.toISOString() ?? null;

// Desactivada gana sobre archivada: es la baja que el autor no deshace con "Restaurar".
function stateOf(row: PostViewRow): PostViewDto['state'] {
  if (row.deactivatedAt) return 'DEACTIVATED';
  return row.archivedAt ? 'ARCHIVED' : 'ACTIVE';
}

// Convierte la clave guardada en un enlace de lectura (MediaUrlService.urlFor).
export type UrlFor = (key: string) => string;

// Fila de Prisma → vista pública. No expone correo, rol ni nada más de users.
export function toPostView(row: PostViewRow, urlFor: UrlFor): PostViewDto {
  const profile = row.author.profile;
  return {
    id: row.id,
    type: row.type,
    state: stateOf(row),
    content: row.content,
    location: row.location,
    createdAt: row.createdAt.toISOString(),
    editedAt: iso(row.editedAt),
    eventStartsAt: iso(row.eventStartsAt),
    eventLocation: row.eventLocation,
    codeSnippet: row.codeSnippet,
    groupName: row.groupName,
    groupSpots: row.groupSpots,
    media: row.media.map((m) => ({
      url: urlFor(m.storageKey),
      mediaType: m.mediaType,
      mimeType: m.mimeType,
    })),
    author: {
      id: row.author.id,
      handle: profile?.handle ?? '',
      displayName: profile?.displayName ?? '',
      careerName: profile?.career?.name ?? null,
      // Bug 1043: la foto del perfil, igual que en la cabecera del perfil.
      avatarUrl: profile?.avatarKey ? urlFor(profile.avatarKey) : null,
      verified: row.author.verificationStatus === 'VERIFIED',
    },
    reactionCount: row._count.reactions,
    commentCount: row._count.comments,
    myReaction: row.reactions[0]?.type ?? null,
    savedByMe: row.savedBy.length > 0,
  };
}

// Se piden limit + 1 filas: si llegó la extra, hay otra página y el cursor es
// el id de la última que se devuelve.
export function toPostPage(
  rows: PostViewRow[],
  limit: number,
  urlFor: UrlFor,
): PostPageDto {
  const items = rows.slice(0, limit);
  const last = items.at(-1);
  return {
    items: items.map((row) => toPostView(row, urlFor)),
    nextCursor: rows.length > limit && last ? last.id : null,
  };
}
