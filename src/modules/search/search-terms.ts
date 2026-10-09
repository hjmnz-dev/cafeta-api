// Reglas de la consulta de búsqueda (spec 0008, decisión 28): palabras sueltas,
// al menos 2 caracteres en total, y los comodines de LIKE tratados como texto.
export const SEARCH_MIN_CHARS = 2;
export const SEARCH_MAX_TERMS = 6;

// Palabras de la búsqueda, sin espacios de sobra y con un tope.
export function queryTerms(query: string): string[] {
  return query.trim().split(/\s+/).filter(Boolean).slice(0, SEARCH_MAX_TERMS);
}

// Cuenta en puntos de código, como las demás reglas de largo de la API.
export function isSearchable(query: string): boolean {
  return [...query.trim()].length >= SEARCH_MIN_CHARS;
}

// '%texto%' con % _ y \ escapados: lo que el usuario escribe nunca es patrón.
export function toLikePattern(term: string): string {
  return `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}
