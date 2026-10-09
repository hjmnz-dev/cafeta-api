import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import {
  COMMENT_MAX,
  commentChangeBlock,
  commentNotFound,
  normalizeComment,
} from './comment-rules.js';

// Reglas de los comentarios (spec 0009, decisiones 21 y 24). Las e2e prueban el
// recorrido completo contra PostgreSQL; aquí se fija cada regla.
const ME = '01926f00-0000-7000-8000-000000000001';
const OTHER = '01926f00-0000-7000-8000-000000000002';

const codeOf = (error: unknown): unknown =>
  (error as { getResponse: () => { code: string } }).getResponse().code;

const thrownBy = (fn: () => unknown): unknown => {
  try {
    fn();
  } catch (error) {
    return error;
  }
  return null;
};

describe('normalizeComment', () => {
  it('recorta los bordes y conserva el texto', () => {
    expect(normalizeComment('  Buen resumen  ')).toBe('Buen resumen');
  });

  it('un texto vacío o de solo espacios responde COMMENT_EMPTY', () => {
    for (const raw of ['', '   ', '\n\t ']) {
      const error = thrownBy(() => normalizeComment(raw));
      expect(error).toBeInstanceOf(BadRequestException);
      expect(codeOf(error)).toBe('COMMENT_EMPTY');
    }
  });

  it('admite 500 caracteres y rechaza 501 con COMMENT_TOO_LONG', () => {
    expect(normalizeComment('a'.repeat(COMMENT_MAX))).toHaveLength(COMMENT_MAX);
    const error = thrownBy(() => normalizeComment('a'.repeat(COMMENT_MAX + 1)));
    expect(error).toBeInstanceOf(BadRequestException);
    expect(codeOf(error)).toBe('COMMENT_TOO_LONG');
  });

  it('cuenta puntos de código: 500 emojis caben aunque ocupen más unidades', () => {
    const emojis = '😀'.repeat(COMMENT_MAX);
    expect(normalizeComment(emojis)).toBe(emojis);
    expect(codeOf(thrownBy(() => normalizeComment(emojis + '😀')))).toBe(
      'COMMENT_TOO_LONG',
    );
  });
});

describe('commentChangeBlock', () => {
  it('no bloquea un comentario propio y activo', () => {
    expect(
      commentChangeBlock({ authorId: ME, deactivatedAt: null }, ME),
    ).toBeNull();
  });

  it('un ajeno recibe 403 NOT_COMMENT_AUTHOR', () => {
    const block = commentChangeBlock(
      { authorId: OTHER, deactivatedAt: null },
      ME,
    );
    expect(block).toBeInstanceOf(ForbiddenException);
    expect(codeOf(block)).toBe('NOT_COMMENT_AUTHOR');
  });

  it('uno ya desactivado responde 409 ALREADY_INACTIVE', () => {
    const block = commentChangeBlock(
      { authorId: ME, deactivatedAt: new Date() },
      ME,
    );
    expect(block).toBeInstanceOf(ConflictException);
    expect(codeOf(block)).toBe('ALREADY_INACTIVE');
  });

  it('el autor se comprueba antes que el estado: un ajeno no se entera si se desactivó', () => {
    const block = commentChangeBlock(
      { authorId: OTHER, deactivatedAt: new Date() },
      ME,
    );
    expect(codeOf(block)).toBe('NOT_COMMENT_AUTHOR');
  });
});

describe('commentNotFound', () => {
  it('responde 404 COMMENT_NOT_FOUND', () => {
    expect(codeOf(commentNotFound())).toBe('COMMENT_NOT_FOUND');
  });
});
