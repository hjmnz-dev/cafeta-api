import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export const RESOLVE_ACTIONS = ['DISMISS', 'DEACTIVATE_TARGET'] as const;
export type ResolveAction = (typeof RESOLVE_ACTIONS)[number];

export class ResolveReportDto {
  /** DISMISS cierra solo este reporte; DEACTIVATE_TARGET sanciona al objetivo. */
  @IsIn(RESOLVE_ACTIONS)
  action: ResolveAction;

  /** Obligatoria al sancionar (3 a 500 caracteres); opcional al desestimar. */
  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() || undefined : value,
  )
  @IsString()
  @MaxLength(500)
  note?: string;
}
