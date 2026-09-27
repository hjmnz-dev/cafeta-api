import type { Role } from '../../generated/prisma/client.js';

// Contenido del JWT (spec 0004). jti es el id de la fila en sessions.
export interface TokenPayload {
  sub: string;
  jti: string;
  role: Role;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Un token firmado por nosotros siempre trae sub y jti como UUID; si no, se
// trata como inválido antes de tocar la base.
export function isTokenPayload(value: unknown): value is TokenPayload {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.sub === 'string' &&
    UUID.test(v.sub) &&
    typeof v.jti === 'string' &&
    UUID.test(v.jti)
  );
}
