import { ApiProperty } from '@nestjs/swagger';
import {
  ReportReason,
  ReportStatus,
  ReportTarget,
} from '../../../generated/prisma/client.js';

export class ReportViewDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: ReportTarget })
  targetType!: ReportTarget;

  @ApiProperty({ format: 'uuid' })
  targetId!: string;

  @ApiProperty({ enum: ReportReason })
  reason!: ReportReason;

  @ApiProperty({ enum: ReportStatus })
  status!: ReportStatus;

  @ApiProperty()
  createdAt!: Date;
}
