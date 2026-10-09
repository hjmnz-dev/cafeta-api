import { ApiProperty } from '@nestjs/swagger';
import { MediaType } from '../../../generated/prisma/enums.js';

export class StoryMediaDto {
  /** Enlace de lectura que vence en una hora como máximo. */
  url: string;
  @ApiProperty({ enum: MediaType, enumName: 'MediaType' })
  mediaType: MediaType;
  /** @example image/jpeg */
  mimeType: string;
}

export class StoryViewDto {
  id: string;
  @ApiProperty({ type: String, nullable: true })
  text: string | null;
  media: StoryMediaDto;
  /** Fecha de creación en ISO 8601. */
  createdAt: string;
  /** Vence 24 horas después de crearse y no cambia al editar. */
  expiresAt: string;
  @ApiProperty({ type: String, nullable: true })
  editedAt: string | null;
}

export class StoryAuthorDto {
  id: string;
  /** @example cgomez_intec */
  handle: string;
  /** @example Carlos Gómez */
  displayName: string;
  /** Enlace de lectura de la foto, o null si no tiene. */
  @ApiProperty({ type: String, nullable: true })
  avatarUrl: string | null;
}

// Las historias vigentes de un autor, de la más antigua a la más reciente.
export class StoryGroupDto {
  author: StoryAuthorDto;
  stories: StoryViewDto[];
}

// Un grupo por autor, el de la historia más reciente primero.
export class StoryTrayDto {
  groups: StoryGroupDto[];
}
