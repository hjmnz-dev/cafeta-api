// Paginación por cursor sobre una lista de ids ya ordenada (spec 0008,
// decisión 28). El cursor es el id del último elemento de la página anterior.
export type IdWindow =
  { ok: true; ids: string[]; hasMore: boolean } | { ok: false };

// Devuelve hasta `limit` ids después del cursor, y si queda más. Un cursor que
// no está en la lista es inválido, igual que en el resto de la API.
export function windowAfter(
  ids: readonly string[],
  cursor: string | undefined,
  limit: number,
): IdWindow {
  const start = cursor === undefined ? 0 : ids.indexOf(cursor) + 1;
  if (cursor !== undefined && start === 0) return { ok: false };
  const page = ids.slice(start, start + limit);
  return { ok: true, ids: page, hasMore: start + limit < ids.length };
}

// Reordena filas según el orden de `ids` (Prisma devuelve `in` sin orden).
export function inOrderOf<T extends { id: string }>(
  ids: readonly string[],
  rows: readonly T[],
): T[] {
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids.flatMap((id) => {
    const row = byId.get(id);
    return row ? [row] : [];
  });
}
