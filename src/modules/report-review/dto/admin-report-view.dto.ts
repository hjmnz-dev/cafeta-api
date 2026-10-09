import { ApiProperty } from '@nestjs/swagger';
import {
  ReportReason,
  ReportStatus,
  ReportTarget,
} from '../../../generated/prisma/enums.js';

export const POST_STATES = [
  'ACTIVE',
  'ARCHIVED',
  'DEACTIVATED',
  'DELETED',
] as const;
export type PostState = (typeof POST_STATES)[number];

export class ReportPersonDto {
  id: string;
  /** @example cgomez_intec */
  handle: string;
  /** @example Carlos Gómez */
  displayName: string;
}

// Lo reportado, tal como está hoy. El admin lo lee directo: ve lo bloqueado o
// archivado también.
export class AdminReportTargetDto {
  /** Usuario reportado; null si el objetivo es una publicación. */
  @ApiProperty({ type: String, nullable: true })
  userId: string | null;
  /** Publicación reportada; null si es un usuario o ya fue borrada. */
  @ApiProperty({ type: String, nullable: true })
  postId: string | null;
  /** Usuario reportado, o autor de la publicación; null si la borraron. */
  @ApiProperty({ type: String, nullable: true })
  handle: string | null;
  @ApiProperty({ type: String, nullable: true })
  displayName: string | null;
  /** true si la cuenta o la publicación siguen activas; null si ya no existe. */
  @ApiProperty({ type: Boolean, nullable: true })
  active: boolean | null;
  /** Copia del texto de la publicación al momento del reporte. */
  @ApiProperty({ type: String, nullable: true })
  snapshot: string | null;
  /** Texto actual de la publicación; null si fue borrada o no es publicación. */
  @ApiProperty({ type: String, nullable: true })
  currentContent: string | null;
  @ApiProperty({ enum: POST_STATES, nullable: true })
  postState: PostState | null;
}

export class AdminReportViewDto {
  id: string;
  @ApiProperty({ enum: ReportTarget, enumName: 'ReportTarget' })
  targetType: ReportTarget;
  @ApiProperty({ enum: ReportReason, enumName: 'ReportReason' })
  reason: ReportReason;
  @ApiProperty({ type: String, nullable: true })
  details: string | null;
  @ApiProperty({ enum: ReportStatus, enumName: 'ReportStatus' })
  status: ReportStatus;
  reporter: ReportPersonDto;
  target: AdminReportTargetDto;
  /** Otros reportes pendientes sobre el mismo objetivo. */
  otherPending: number;
  @ApiProperty({ type: ReportPersonDto, nullable: true })
  resolvedBy: ReportPersonDto | null;
  @ApiProperty({ type: String, nullable: true })
  resolvedAt: string | null;
  @ApiProperty({ type: String, nullable: true })
  resolutionNote: string | null;
  /** Fecha del reporte en ISO 8601. */
  createdAt: string;
}

export class RelatedReportDto {
  id: string;
  @ApiProperty({ enum: ReportReason, enumName: 'ReportReason' })
  reason: ReportReason;
  @ApiProperty({ type: String, nullable: true })
  details: string | null;
  reporter: ReportPersonDto;
  createdAt: string;
}

export class AdminReportDetailDto extends AdminReportViewDto {
  /** Los otros reportes pendientes sobre el mismo objetivo, del más antiguo. */
  related: RelatedReportDto[];
}

export class AdminReportPageDto {
  items: AdminReportViewDto[];
  @ApiProperty({ type: String, nullable: true })
  nextCursor: string | null;
}
