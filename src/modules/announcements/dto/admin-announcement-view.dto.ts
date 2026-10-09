import { ApiProperty } from '@nestjs/swagger';
import { PostMediaDto } from '../../posts/dto/post-view.dto.js';

export class AdminAnnouncementViewDto {
  id: string;
  @ApiProperty({ type: String, nullable: true })
  content: string | null;
  /** Fecha de publicación en ISO 8601. */
  createdAt: string;
  @ApiProperty({ type: String, nullable: true })
  editedAt: string | null;
  /** false si está desactivado o archivado: ya no sale en el feed. */
  active: boolean;
  @ApiProperty({ type: String, nullable: true })
  deactivatedAt: string | null;
  @ApiProperty({ type: String, nullable: true })
  archivedAt: string | null;
  /** Quién lo publicó (el admin autor). */
  publishedBy: string;
  media: PostMediaDto[];
  reactionCount: number;
  commentCount: number;
}

export class AdminAnnouncementPageDto {
  items: AdminAnnouncementViewDto[];
  /** id para pedir la página siguiente; null si no hay más. */
  @ApiProperty({ type: String, nullable: true })
  nextCursor: string | null;
}
