import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  type HttpException,
} from '@nestjs/common';

// Reglas de los comentarios de publicaciones (spec 0009, decisión 21) y de
// historias (decisión 24): las mismas, así que viven aquí. Son funciones puras.
export const COMMENT_MAX = 500;

// Cuenta en puntos de código, igual que varchar(500) en PostgreSQL.
const codePoints = (text: string): number => [...text].length;

// Recorta el texto y lo valida: de 1 a 500 caracteres.
export function normalizeComment(raw: string): string {
  const content = raw.trim();
  if (content.length === 0) {
    throw new BadRequestException({
      message: 'Escribe algo antes de comentar',
      code: 'COMMENT_EMPTY',
    });
  }
  if (codePoints(content) > COMMENT_MAX) {
    throw new BadRequestException({
      message: `Un comentario admite hasta ${COMMENT_MAX} caracteres`,
      code: 'COMMENT_TOO_LONG',
    });
  }
  return content;
}

export interface CommentState {
  authorId: string;
  deactivatedAt: Date | null;
}

export const commentNotFound = (): NotFoundException =>
  new NotFoundException({
    message: 'El comentario no existe',
    code: 'COMMENT_NOT_FOUND',
  });

// Por qué no se puede editar o desactivar un comentario: solo su autor puede
// (403) y uno ya desactivado no se toca (409). null si nada lo impide.
export function commentChangeBlock(
  comment: CommentState,
  userId: string,
): HttpException | null {
  if (comment.authorId !== userId) {
    return new ForbiddenException({
      message: 'Solo quien escribió el comentario puede cambiarlo',
      code: 'NOT_COMMENT_AUTHOR',
    });
  }
  if (comment.deactivatedAt) {
    return new ConflictException({
      message: 'El comentario ya estaba desactivado',
      code: 'ALREADY_INACTIVE',
    });
  }
  return null;
}
