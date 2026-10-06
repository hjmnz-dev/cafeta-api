import type { ErrorEvent, EventHint } from '@sentry/node';
import { Prisma } from '../../generated/prisma/client.js';

const PRISMA_ERRORS = [
  Prisma.PrismaClientKnownRequestError,
  Prisma.PrismaClientUnknownRequestError,
  Prisma.PrismaClientValidationError,
  Prisma.PrismaClientInitializationError,
  Prisma.PrismaClientRustPanicError,
];

/**
 * Limpia cada evento antes de salir hacia Sentry (spec 0007, AC-3). Solo deja el
 * método, la URL sin query y el id del usuario. Los errores de Prisma y de `pg`
 * pierden su mensaje, que puede traer valores de la consulta.
 */
export function scrubEvent(event: ErrorEvent, hint: EventHint): ErrorEvent {
  const { server_name: _server, breadcrumbs: _crumbs, ...rest } = event;
  const scrubbed: ErrorEvent = { ...rest };

  if (event.request) {
    scrubbed.request = {
      method: event.request.method,
      url: event.request.url?.split('?')[0],
    };
  }
  if (event.user) {
    scrubbed.user = event.user.id === undefined ? {} : { id: event.user.id };
  }

  const summary = databaseErrorSummary(hint.originalException);
  const values = event.exception?.values;
  if (summary && values && values.length > 0) {
    // La excepción principal es la última; se descartan los errores enlazados.
    const main = values[values.length - 1];
    scrubbed.exception = { values: [{ ...main, value: summary }] };
  }
  return scrubbed;
}

// `<tipo> <code>` para errores de base; null para cualquier otro error.
function databaseErrorSummary(error: unknown): string | null {
  if (!(error instanceof Error)) return null;
  const isPrisma = PRISMA_ERRORS.some((type) => error instanceof type);
  // pg no es dependencia directa: su DatabaseError se reconoce por el constructor.
  const isPg = error.constructor.name === 'DatabaseError';
  if (!isPrisma && !isPg) return null;
  const { code, errorCode } = error as { code?: unknown; errorCode?: unknown };
  const value = code ?? errorCode;
  const type = error.constructor.name;
  return typeof value === 'string' ? `${type} ${value}` : type;
}
