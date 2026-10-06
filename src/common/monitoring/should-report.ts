import { HttpException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import type { ErrorBody } from '../filters/http-exception.filter.js';

// Códigos de Prisma de una base caída: en una caída llegarían en cada petición.
const DB_DOWN_CODES = new Set(['P1001', 'P1002', 'P1017']);

/** Decide si un error va a Sentry (spec 0007, AC-1 y AC-2). Función pura. */
export function shouldReport(exception: unknown, body: ErrorBody): boolean {
  if (body.statusCode < 500) return false;
  if (body.code === 'DATABASE_UNAVAILABLE') return false;
  if (exception instanceof Prisma.PrismaClientInitializationError) return false;
  if (
    exception instanceof Prisma.PrismaClientKnownRequestError &&
    DB_DOWN_CODES.has(exception.code)
  ) {
    return false;
  }
  if (!(exception instanceof HttpException) && isClientStatus(exception)) {
    return false;
  }
  return true;
}

// Errores que no son HttpException pero traen un 4xx (por ejemplo, el 413 de
// un cuerpo demasiado grande que lanza el parser de Express).
function isClientStatus(exception: unknown): boolean {
  if (typeof exception !== 'object' || exception === null) return false;
  const { status, statusCode } = exception as {
    status?: unknown;
    statusCode?: unknown;
  };
  return [status, statusCode].some(
    (value) => typeof value === 'number' && value >= 400 && value <= 499,
  );
}
