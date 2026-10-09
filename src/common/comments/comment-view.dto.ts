import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

// Cuerpo de crear y editar un comentario. El largo se valida en el service
// (normalizeComment) para responder COMMENT_EMPTY y COMMENT_TOO_LONG.
export class CommentContentDto {
  /** Texto del comentario, de 1 a 500 caracteres sin los bordes. */
  @IsString()
  content: string;
}

export class CommentAuthorDto {
  id: string;
  /** @example cgomez_intec */
  handle: string;
  /** @example Carlos Gómez */
  displayName: string;
  /** Enlace de lectura de la foto, o null si no tiene. */
  @ApiProperty({ type: String, nullable: true })
  avatarUrl: string | null;
}

export class CommentViewDto {
  id: string;
  content: string;
  /** Fecha de creación en ISO 8601. */
  createdAt: string;
  @ApiProperty({ type: String, nullable: true })
  editedAt: string | null;
  author: CommentAuthorDto;
  /** true si el comentario es mío: la web ofrece editar y desactivar. */
  isMine: boolean;
}

export class CommentPageDto {
  @ApiProperty({ type: [CommentViewDto] })
  items: CommentViewDto[];
  /** id para pedir la página siguiente; null cuando no hay más. */
  @ApiProperty({ type: String, nullable: true })
  nextCursor: string | null;
}
