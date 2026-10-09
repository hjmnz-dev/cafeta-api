// Consultas compartidas por los comentarios de publicaciones y de historias.
// Las dos tablas tienen las mismas columnas, así que usan el mismo orden,
// cursor y selección.

// Del más antiguo al más nuevo, como se lee una conversación; el id desempata.
export const COMMENT_ORDER = [{ createdAt: 'asc' }, { id: 'asc' }] as const;

// Lo que viene después del comentario del cursor en el orden de COMMENT_ORDER.
export function afterComment(createdAt: Date, id: string) {
  return {
    OR: [{ createdAt: { gt: createdAt } }, { createdAt, id: { gt: id } }],
  };
}

// Lo que dibuja un comentario.
export const COMMENT_VIEW_SELECT = {
  id: true,
  content: true,
  createdAt: true,
  editedAt: true,
  author: {
    select: {
      id: true,
      profile: {
        select: { handle: true, displayName: true, avatarKey: true },
      },
    },
  },
} as const;
