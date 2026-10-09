import type {
  StoryGroupDto,
  StoryTrayDto,
  StoryViewDto,
} from './dto/story-view.dto.js';
import type { StoryViewRow } from './story-queries.js';

// Convierte la clave guardada en un enlace de lectura (MediaUrlService.urlFor).
export type UrlFor = (key: string) => string;

// Una historia sin medio no se dibuja: la API no las crea, pero la columna
// admite null y el visor no sabría qué mostrar.
export function toStoryView(
  row: StoryViewRow,
  urlFor: UrlFor,
): StoryViewDto | null {
  if (!row.mediaKey || !row.mediaType || !row.mediaMimeType) return null;
  return {
    id: row.id,
    text: row.text,
    media: {
      url: urlFor(row.mediaKey),
      mediaType: row.mediaType,
      mimeType: row.mediaMimeType,
    },
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    editedAt: row.editedAt?.toISOString() ?? null,
  };
}

// Las filas llegan de la más reciente a la más antigua: el primer grupo es el
// del autor con la historia más reciente; dentro de cada grupo se invierte
// para verlas en el orden en que se publicaron.
export function toStoryTray(
  rows: StoryViewRow[],
  urlFor: UrlFor,
): StoryTrayDto {
  const groups = new Map<string, StoryGroupDto>();
  for (const row of rows) {
    const story = toStoryView(row, urlFor);
    if (!story) continue;
    const group = groups.get(row.author.id) ?? {
      author: {
        id: row.author.id,
        handle: row.author.profile?.handle ?? '',
        displayName: row.author.profile?.displayName ?? '',
        avatarUrl: row.author.profile?.avatarKey
          ? urlFor(row.author.profile.avatarKey)
          : null,
      },
      stories: [],
    };
    group.stories.unshift(story);
    groups.set(row.author.id, group);
  }
  return { groups: [...groups.values()] };
}
