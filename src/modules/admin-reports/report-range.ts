import { BadRequestException } from '@nestjs/common';

// Rango de un informe (spec 0008, decisión 35): días completos en hora de Santo
// Domingo, de hasta 92 días.
export const REPORT_TIME_ZONE = 'America/Santo_Domingo';
export const MAX_RANGE_DAYS = 92;

// Santo Domingo está en UTC-4 todo el año (sin horario de verano), así que el
// día local empieza a las 04:00 UTC.
const UTC_OFFSET_MS = 4 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
// PostgreSQL no tiene año 0 ni acepta años de 5 dígitos: fuera de estos años la
// fecha se rechaza aquí en vez de fallar con un 500 al consultar.
const MIN_YEAR = 2000;
const MAX_YEAR = 2100;

export interface ReportRange {
  from: string;
  to: string;
  /** Inicio del primer día, como instante UTC. */
  startsAt: Date;
  /** Inicio del día siguiente al último: el límite superior es exclusivo. */
  endsAt: Date;
  /** Cada día del rango, YYYY-MM-DD. */
  days: string[];
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

function invalid(message: string, code: string): BadRequestException {
  return new BadRequestException({ message, code });
}

export function parseReportRange(from: string, to: string): ReportRange {
  const startsAt = localMidnight(from);
  const lastDay = localMidnight(to);
  if (!startsAt || !lastDay || startsAt.getTime() > lastDay.getTime()) {
    throw invalid('El rango de fechas no es válido', 'INVALID_DATE_RANGE');
  }
  const count =
    Math.round((lastDay.getTime() - startsAt.getTime()) / DAY_MS) + 1;
  if (count > MAX_RANGE_DAYS) {
    throw invalid(
      `El rango no puede pasar de ${MAX_RANGE_DAYS} días`,
      'RANGE_TOO_LARGE',
    );
  }
  const days = Array.from({ length: count }, (_, i) =>
    new Date(startsAt.getTime() - UTC_OFFSET_MS + i * DAY_MS)
      .toISOString()
      .slice(0, 10),
  );
  return {
    from,
    to,
    startsAt,
    endsAt: new Date(lastDay.getTime() + DAY_MS),
    days,
  };
}
