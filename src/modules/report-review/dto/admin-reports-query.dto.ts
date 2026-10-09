import { IsIn, IsOptional } from 'class-validator';
import { PageQueryDto } from '../../posts/dto/page-query.dto.js';

export const REPORT_STATUS_FILTERS = [
  'PENDING',
  'SANCTIONED',
  'DISMISSED',
] as const;
export const REPORT_TARGET_FILTERS = ['USER', 'POST'] as const;

export type ReportStatusFilter = (typeof REPORT_STATUS_FILTERS)[number];

// ?status=&targetType=&cursor=&limit=. Sin status se ve la cola de pendientes.
export class AdminReportsQueryDto extends PageQueryDto {
  /** PENDING (por defecto), SANCTIONED o DISMISSED. */
  @IsOptional()
  @IsIn(REPORT_STATUS_FILTERS)
  status: ReportStatusFilter = 'PENDING';

  /** USER o POST; sin valor, de los dos. */
  @IsOptional()
  @IsIn(REPORT_TARGET_FILTERS)
  targetType?: (typeof REPORT_TARGET_FILTERS)[number];
}
