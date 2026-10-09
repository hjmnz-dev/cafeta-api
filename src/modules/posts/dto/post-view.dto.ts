import { ApiProperty } from '@nestjs/swagger';
import {
  MediaType,
  PostType,
  ReactionType,
} from '../../../generated/prisma/enums.js';

export class PostAuthorDto {
  id: string;
  /** @example cgomez_intec */
  handle: string;
  /** @example Carlos Gómez */
  displayName: string;
  @ApiProperty({
    type: String,
    nullable: true,
    example: 'Ingeniería de Software',
  })
  careerName: string | null;
  /** true si la cuenta está verificada. */
  verified: boolean;
}

export class PostMediaDto {
  /** Enlace de lectura que vence en una hora como máximo. */
  url: string;
  @ApiProperty({ enum: MediaType, enumName: 'MediaType' })
  mediaType: MediaType;
  /** @example image/jpeg */
  mimeType: string;
}

export const POST_STATES = ['ACTIVE', 'ARCHIVED', 'DEACTIVATED'] as const;
export type PostState = (typeof POST_STATES)[number];

export class PostViewDto {
  id: string;
  @ApiProperty({ enum: PostType, enumName: 'PostType' })
  type: PostType;
  @ApiProperty({ type: String, nullable: true })
  content: string | null;
  @ApiProperty({ type: String, nullable: true, example: 'Biblioteca' })
  location: string | null;
  /** ACTIVE se ve en el feed y el perfil; ARCHIVED y DEACTIVATED solo las ve su autor. */
  @ApiProperty({ enum: POST_STATES, enumName: 'PostState' })
  state: PostState;
  /** Fecha de creación en ISO 8601. */
  createdAt: string;
  @ApiProperty({ type: String, nullable: true })
  editedAt: string | null;
  @ApiProperty({ type: String, nullable: true })
  eventStartsAt: string | null;
  @ApiProperty({ type: String, nullable: true })
  eventLocation: string | null;
  @ApiProperty({ type: String, nullable: true })
  codeSnippet: string | null;
  @ApiProperty({ type: String, nullable: true })
  groupName: string | null;
  @ApiProperty({ type: Number, nullable: true })
  groupSpots: number | null;
  /** Adjuntos en su orden: hasta 4 imágenes, o 1 video, o 1 PDF. */
  media: PostMediaDto[];
  author: PostAuthorDto;
  reactionCount: number;
  commentCount: number;
  /** Mi reacción activa a la publicación; null si no he reaccionado. */
  @ApiProperty({ enum: ReactionType, enumName: 'ReactionType', nullable: true })
  myReaction: ReactionType | null;
  /** true si guardé la publicación (spec 0009, decisión 19). */
  savedByMe: boolean;
}
