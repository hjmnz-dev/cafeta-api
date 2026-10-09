import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { storyChangeBlock, storyNotFound } from './story-rules.js';

// Qué código responde cuando un cambio sobre una historia propia no se aplica
// (spec 0009, decisión 23). Las e2e prueban el recorrido completo.
const ME = '01926f00-0000-7000-8000-000000000001';
const OTHER = '01926f00-0000-7000-8000-000000000002';
const NOW = new Date('2026-10-07T12:00:00.000Z');
const HOUR_MS = 60 * 60 * 1000;

const story = (overrides: Partial<Parameters<typeof storyChangeBlock>[0]>) => ({
  authorId: ME,
  deactivatedAt: null,
  expiresAt: new Date(NOW.getTime() + HOUR_MS),
  ...overrides,
});

const codeOf = (error: unknown): unknown =>
  (error as { getResponse: () => { code: string } }).getResponse().code;

describe('storyChangeBlock', () => {
  it('no bloquea una historia propia, vigente y activa', () => {
    expect(storyChangeBlock(story({}), ME, NOW)).toBeNull();
  });

  it('un ajeno recibe 403 NOT_STORY_AUTHOR', () => {
    const block = storyChangeBlock(story({ authorId: OTHER }), ME, NOW);
    expect(block).toBeInstanceOf(ForbiddenException);
    expect(codeOf(block)).toBe('NOT_STORY_AUTHOR');
  });

  it('una desactivada responde 409 ALREADY_INACTIVE', () => {
    const block = storyChangeBlock(story({ deactivatedAt: NOW }), ME, NOW);
    expect(block).toBeInstanceOf(ConflictException);
    expect(codeOf(block)).toBe('ALREADY_INACTIVE');
  });

  it('una vencida responde 409 STORY_EXPIRED, también justo al vencer', () => {
    const vencida = story({ expiresAt: new Date(NOW.getTime() - 1) });
    expect(codeOf(storyChangeBlock(vencida, ME, NOW))).toBe('STORY_EXPIRED');
    const alLimite = story({ expiresAt: NOW });
    expect(codeOf(storyChangeBlock(alLimite, ME, NOW))).toBe('STORY_EXPIRED');
  });

  it('el autor se comprueba antes que el estado: un ajeno no se entera si venció', () => {
    const vencida = story({
      authorId: OTHER,
      expiresAt: new Date(NOW.getTime() - HOUR_MS),
    });
    expect(codeOf(storyChangeBlock(vencida, ME, NOW))).toBe('NOT_STORY_AUTHOR');
  });
});

describe('storyNotFound', () => {
  it('responde 404 STORY_NOT_FOUND', () => {
    const error = storyNotFound();
    expect(error).toBeInstanceOf(NotFoundException);
    expect(codeOf(error)).toBe('STORY_NOT_FOUND');
  });
});
