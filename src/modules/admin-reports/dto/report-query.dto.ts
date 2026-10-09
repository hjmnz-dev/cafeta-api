import { ApiProperty } from '@nestjs/swagger';
import { IsIn, Matches } from 'class-validator';
import type { ReportKind } from '../report-table.js';

export const REPORT_KINDS: readonly ReportKind[] = ['activity', 'moderation'];

export class ReportKindParamDto {
  @ApiProperty({ enum: REPORT_KINDS })
  @IsIn(REPORT_KINDS)
  kind: ReportKind;
}

// ?from=YYYY-MM-DD&to=YYYY-MM-DD: días completos en hora de Santo Domingo. Que la
// fecha exista y el rango sea de 92 días como máximo lo revisa el service.
export class ReportRangeQueryDto {
  /** Primer día del rango. */
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  from: string;

  /** Último día del rango, inclusive. */
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  to: string;
}
