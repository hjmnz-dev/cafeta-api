import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { toLikePattern } from './search-terms.js';

// Tope de candidatos por consulta: la visibilidad se aplica después, sobre
// estos ids, y la web nunca pasa de unas pocas páginas.
export const CANDIDATE_LIMIT = 300;

const NORMALIZED = (column: Prisma.Sql) =>
  Prisma.sql`search_normalize(${column})`;

// Una condición por palabra: todas deben aparecer en alguno de los campos.
function allTerms(
  terms: readonly string[],
  columns: readonly Prisma.Sql[],
): Prisma.Sql {
  const perTerm = terms.map((term) => {
    const pattern = toLikePattern(term);
    return Prisma.sql`(${Prisma.join(
      columns.map(
        (c) => Prisma.sql`${NORMALIZED(c)} LIKE search_normalize(${pattern})`,
      ),
      ' OR ',
    )})`;
  });
  return Prisma.join(perTerm, ' AND ');
}

// El único lugar con SQL crudo de la búsqueda (spec 0008, decisión 28): solo
// encuentra y ordena ids con unaccent y pg_trgm. Quién ve qué lo decide
// VisibilityService sobre estos ids; aquí no se mira privacidad ni bloqueos.
@Injectable()
export class SearchRepository {
  constructor(private readonly prisma: PrismaService) {}

  // Perfiles cuyo nombre, usuario o carrera contienen todas las palabras. Los
  // que empiezan por la búsqueda van primero, luego por nombre.
  async userIds(terms: readonly string[]): Promise<string[]> {
    const first = toLikePattern(terms[0] ?? '');
    const prefix = `${first.slice(1, -1)}%`;
    const rows = await this.prisma.$queryRaw<{ user_id: string }[]>`
      SELECT p.user_id
      FROM profiles p
      LEFT JOIN careers c ON c.id = p.career_id
      WHERE ${allTerms(terms, [
        Prisma.sql`p.display_name`,
        Prisma.sql`p.handle`,
        Prisma.sql`c.name`,
      ])}
      ORDER BY
        (search_normalize(p.display_name) LIKE search_normalize(${prefix})) DESC,
        search_normalize(p.display_name) ASC,
        p.user_id ASC
      LIMIT ${CANDIDATE_LIMIT}`;
    return rows.map((r) => r.user_id);
  }

  // Publicaciones activas cuyo texto contiene todas las palabras, de la más
  // reciente a la más antigua (el orden del feed).
  async postIds(terms: readonly string[]): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT po.id
      FROM posts po
      WHERE po.deactivated_at IS NULL
        AND po.archived_at IS NULL
        AND ${allTerms(terms, [Prisma.sql`po.content`])}
      ORDER BY po.created_at DESC, po.id DESC
      LIMIT ${CANDIDATE_LIMIT}`;
    return rows.map((r) => r.id);
  }

  // Explorar: las de los últimos 7 días primero, por reacciones más comentarios
  // y luego por fecha; si hay pocas, las más recientes completan la lista.
  async exploreIds(viewerId: string): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT po.id
      FROM posts po
      WHERE po.deactivated_at IS NULL
        AND po.archived_at IS NULL
        AND po.author_id <> ${viewerId}::uuid
      ORDER BY
        (po.created_at >= now() - interval '7 days') DESC,
        CASE WHEN po.created_at >= now() - interval '7 days' THEN
          (SELECT count(*) FROM post_reactions r
             WHERE r.post_id = po.id AND r.deactivated_at IS NULL)
          + (SELECT count(*) FROM post_comments c
             WHERE c.post_id = po.id AND c.deactivated_at IS NULL)
        END DESC NULLS LAST,
        po.created_at DESC,
        po.id DESC
      LIMIT ${CANDIDATE_LIMIT}`;
    return rows.map((r) => r.id);
  }
}
