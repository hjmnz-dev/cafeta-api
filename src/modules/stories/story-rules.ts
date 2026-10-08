import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  type HttpException,
} from '@nestjs/common';

// Reglas para cambiar una historia propia (spec 0009, decisión 23). Es una
// función pura: StoryEditsService la llama solo cuando el cambio condicional no
// tocó ninguna fila, para decidir con qué código responder.
export interface StoryState {
  authorId: string;
  deactivatedAt: Date | null;
  expiresAt: Date;
}

export const storyNotFound = (): NotFoundException =>
  new NotFoundException({
    message: 'La historia no existe',
    code: 'STORY_NOT_FOUND',
  });

// null cuando nada impide el cambio (por ejemplo, otra petición ya lo dejó así).
export function storyChangeBlock(
  story: StoryState,
  userId: string,
  now: Date,
): HttpException | null {
  if (story.authorId !== userId) {
    return new ForbiddenException({
      message: 'Solo quien publicó la historia puede cambiarla',
      code: 'NOT_STORY_AUTHOR',
    });
  }
  if (story.deactivatedAt) {
    return new ConflictException({
      message: 'La historia ya estaba desactivada',
      code: 'ALREADY_INACTIVE',
    });
  }
  if (story.expiresAt.getTime() <= now.getTime()) {
    return new ConflictException({
      message: 'La historia ya venció',
      code: 'STORY_EXPIRED',
    });
  }
  return null;
}
