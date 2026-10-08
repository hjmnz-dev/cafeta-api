import { BadRequestException } from '@nestjs/common';
import { parseReportRange } from './report-range.js';

function codeOf(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    if (error instanceof BadRequestException) {
      return (error.getResponse() as { code: string }).code;
    }
    throw error;
  }
  return undefined;
}

describe('parseReportRange', () => {
  it('arma los días completos en hora de Santo Domingo (UTC-4)', () => {
    const range = parseReportRange('2026-09-01', '2026-09-03');

    expect(range.days).toEqual(['2026-09-01', '2026-09-02', '2026-09-03']);
    expect(range.startsAt.toISOString()).toBe('2026-09-01T04:00:00.000Z');
    // El límite superior es exclusivo: el inicio del día siguiente.
    expect(range.endsAt.toISOString()).toBe('2026-09-04T04:00:00.000Z');
  });

  it('acepta un solo día y exactamente 92 días', () => {
    expect(parseReportRange('2026-09-01', '2026-09-01').days).toHaveLength(1);
    expect(parseReportRange('2026-07-01', '2026-09-30').days).toHaveLength(92);
  });

  it('rechaza más de 92 días con RANGE_TOO_LARGE', () => {
    expect(codeOf(() => parseReportRange('2026-07-01', '2026-10-01'))).toBe(
      'RANGE_TOO_LARGE',
    );
  });

  it('rechaza fechas al revés o que no existen con INVALID_DATE_RANGE', () => {
    expect(codeOf(() => parseReportRange('2026-09-10', '2026-09-01'))).toBe(
      'INVALID_DATE_RANGE',
    );
    expect(codeOf(() => parseReportRange('2026-02-31', '2026-03-05'))).toBe(
      'INVALID_DATE_RANGE',
    );
    expect(codeOf(() => parseReportRange('2026-09-01', 'mañana'))).toBe(
      'INVALID_DATE_RANGE',
    );
  });
});
