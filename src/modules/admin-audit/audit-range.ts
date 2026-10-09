import { BadRequestException } from '@nestjs/common';

// Rango de fechas de la bitácora (spec 0009, decisión 34): días completos en
// hora de Santo Domingo, ambos extremos inclusivos, igual que los informes de
// la 35. Santo Domingo está en UTC-4 todo el año, así que su día empieza a las
// 04:00 UTC.
const UTC_OFFSET_MS = 4 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
// PostgreSQL no tiene año 0 ni acepta años de 5 dígitos.
const MIN_YEAR = 2000;
const MAX_YEAR = 2100;

export interface AuditRange {
  /** Inicio del primer día, inclusivo. */
  gte?: Date;
  /** Inicio del día siguiente al último, exclusivo. */
  lt?: Date;
}

function localMidnight(day: string): Date | null {
  if (!DATE_PATTERN.test(day)) return null;
  const year = Number(day.slice(0, 4));
  if (year < MIN_YEAR || year > MAX_YEAR) return null;
  const utc = new Date(`${day}T00:00:00.000Z`);
  // Rechaza fechas que no existen, como 2026-02-31.
  if (Number.isNaN(utc.getTime()) || utc.toISOString().slice(0, 10) !== day) {
    return null;
  }
  return new Date(utc.getTime() + UTC_OFFSET_MS);
}

function invalidRange(): BadRequestException {
  return new BadRequestException({
    message: 'El rango de fechas no es válido',
    code: 'INVALID_DATE_RANGE',
  });
}

// Cada extremo es opcional: sin `from` no hay piso y sin `to` no hay techo.
export function parseAuditRange(from?: string, to?: string): AuditRange {
  const start = from === undefined ? undefined : localMidnight(from);
  const last = to === undefined ? undefined : localMidnight(to);
  if (start === null || last === null) throw invalidRange();
  if (start && last && start.getTime() > last.getTime()) throw invalidRange();
  return {
    ...(start ? { gte: start } : {}),
    ...(last ? { lt: new Date(last.getTime() + DAY_MS) } : {}),
  };
}
