-- Búsqueda sin acentos y con índices trigram (spec 0008, decisión 28).
-- Solo SQL: no cambia schema.prisma (Prisma no representa índices por expresión).
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- unaccent() no es IMMUTABLE, y un índice por expresión lo exige. Esta envoltura
-- fija el diccionario, así que para el mismo texto siempre da el mismo resultado.
CREATE FUNCTION "search_normalize"(text) RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
STRICT
SET search_path = public, extensions
AS $$ SELECT lower(unaccent('unaccent', $1)) $$;

CREATE INDEX "profiles_display_name_trgm_idx"
  ON "profiles" USING gin (search_normalize("display_name") gin_trgm_ops);
CREATE INDEX "profiles_handle_trgm_idx"
  ON "profiles" USING gin (search_normalize("handle") gin_trgm_ops);
CREATE INDEX "careers_name_trgm_idx"
  ON "careers" USING gin (search_normalize("name") gin_trgm_ops);
CREATE INDEX "posts_content_trgm_idx"
  ON "posts" USING gin (search_normalize("content") gin_trgm_ops);
