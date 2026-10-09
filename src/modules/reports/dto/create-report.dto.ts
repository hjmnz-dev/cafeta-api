import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import {
  ReportReason,
  ReportTarget,
} from '../../../generated/prisma/client.js';
import { MaxCodePoints } from '../../posts/dto/create-post.dto.js';

export const REPORT_DETAILS_MAX = 500;

// Un texto vacío o de puros espacios cuenta como que no se envió.
const trimToUndefined = ({ value }: { value: unknown }): unknown => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
};

export class CreateReportDto {
  @ApiProperty({ enum: ReportTarget })
  @IsEnum(ReportTarget)
  targetType!: ReportTarget;

  /** id del usuario o de la publicación, según targetType. */
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  targetId!: string;

  @ApiProperty({ enum: ReportReason })
  @IsEnum(ReportReason)
  reason!: ReportReason;

  /** Hasta 500 caracteres. Obligatorio cuando el motivo es OTHER. */
  @ApiProperty({ required: false })
  @IsOptional()
  @Transform(trimToUndefined)
  @IsString()
  @MaxCodePoints(REPORT_DETAILS_MAX)
  details?: string;
}
