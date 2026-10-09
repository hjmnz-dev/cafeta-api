import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { PostsReadService } from '../posts/posts-read.service.js';
import type { VisibilityFacts } from '../visibility/visibility-rules.js';
import type { VisibilityService } from '../visibility/visibility.service.js';
import { ReportTargetResolver } from './report-target.resolver.js';

const REPORTER = 'reporter';
const OTHER = 'other';
const POST = 'post-1';

const facts = (over: Partial<VisibilityFacts> = {}): VisibilityFacts => ({
  isSelf: false,
  ownerActive: true,
  visibility: 'PUBLIC',
  followStatus: null,
  blocked: false,
  ...over,
});

describe('ReportTargetResolver', () => {
  let resolver: ReportTargetResolver;
  let posts: { visibleSummary: ReturnType<typeof vi.fn> };
  let visibility: {
    facts: ReturnType<typeof vi.fn>;
    visibleProfileFacts: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    posts = {
      visibleSummary: vi.fn().mockResolvedValue({
        authorId: OTHER,
        type: 'TEXT',
        content: 'texto de la publicación',
      }),
    };
    visibility = {
      facts: vi.fn().mockResolvedValue(facts()),
      visibleProfileFacts: vi.fn().mockResolvedValue(facts()),
    };
    resolver = new ReportTargetResolver(
      posts as unknown as PostsReadService,
      visibility as unknown as VisibilityService,
    );
  });

  describe('usuario', () => {
    it('devuelve el usuario con su llave USER:<id> y sin copia de texto', async () => {
      await expect(resolver.resolve(REPORTER, 'USER', OTHER)).resolves.toEqual({
        targetUserId: OTHER,
        targetPostId: null,
        targetSnapshot: null,
        pendingKey: 'USER:other',
      });
    });

    it('rechaza reportarse a sí mismo con 400 sin consultar nada', async () => {
      await expect(
        resolver.resolve(REPORTER, 'USER', REPORTER),
      ).rejects.toMatchObject({ response: { code: 'CANNOT_REPORT_SELF' } });
      expect(visibility.visibleProfileFacts).not.toHaveBeenCalled();
    });

    it('deja pasar el 404 de VisibilityService si el perfil no se ve', async () => {
      const notFound = new NotFoundException('no existe');
      visibility.visibleProfileFacts.mockRejectedValue(notFound);

      await expect(resolver.resolve(REPORTER, 'USER', OTHER)).rejects.toBe(
        notFound,
      );
    });
  });

  describe('publicación', () => {
    it('devuelve la publicación con su llave POST:<id> y la copia del texto', async () => {
      await expect(resolver.resolve(REPORTER, 'POST', POST)).resolves.toEqual({
        targetUserId: null,
        targetPostId: POST,
        targetSnapshot: 'texto de la publicación',
        pendingKey: 'POST:post-1',
      });
    });

    it('guarda la copia vacía si la publicación no tiene texto', async () => {
      posts.visibleSummary.mockResolvedValue({
        authorId: OTHER,
        type: 'TEXT',
        content: null,
      });

      await expect(
        resolver.resolve(REPORTER, 'POST', POST),
      ).resolves.toMatchObject({ targetSnapshot: null });
    });

    it('responde 404 POST_NOT_FOUND si no existe, está archivada o desactivada', async () => {
      posts.visibleSummary.mockResolvedValue(null);

      await expect(
        resolver.resolve(REPORTER, 'POST', POST),
      ).rejects.toMatchObject({ response: { code: 'POST_NOT_FOUND' } });
    });

    it('rechaza reportar una publicación propia con 400', async () => {
      posts.visibleSummary.mockResolvedValue({
        authorId: REPORTER,
        type: 'TEXT',
        content: 'mía',
      });

      const attempt = resolver.resolve(REPORTER, 'POST', POST);

      await expect(attempt).rejects.toThrow(BadRequestException);
      await expect(attempt).rejects.toMatchObject({
        response: { code: 'CANNOT_REPORT_SELF' },
      });
    });

    it('responde 404 si el autor la tiene bloqueada para quien reporta', async () => {
      visibility.facts.mockResolvedValue(facts({ blocked: true }));

      await expect(
        resolver.resolve(REPORTER, 'POST', POST),
      ).rejects.toMatchObject({ response: { code: 'POST_NOT_FOUND' } });
    });

    it('responde 404 si el autor es solo para seguidores y quien reporta no lo sigue', async () => {
      visibility.facts.mockResolvedValue(facts({ visibility: 'FOLLOWERS' }));

      await expect(
        resolver.resolve(REPORTER, 'POST', POST),
      ).rejects.toMatchObject({ response: { code: 'POST_NOT_FOUND' } });
    });

    it('la deja reportar si es de seguidores y quien reporta lo sigue', async () => {
      visibility.facts.mockResolvedValue(
        facts({ visibility: 'FOLLOWERS', followStatus: 'ACCEPTED' }),
      );

      await expect(
        resolver.resolve(REPORTER, 'POST', POST),
      ).resolves.toMatchObject({ targetPostId: POST });
    });

    it('responde 404 si el autor ya no tiene perfil', async () => {
      visibility.facts.mockResolvedValue(null);

      await expect(
        resolver.resolve(REPORTER, 'POST', POST),
      ).rejects.toMatchObject({ response: { code: 'POST_NOT_FOUND' } });
    });

    it('un anuncio institucional se puede reportar sin mirar la privacidad del autor', async () => {
      posts.visibleSummary.mockResolvedValue({
        authorId: OTHER,
        type: 'ANNOUNCEMENT',
        content: 'aviso',
      });
      visibility.facts.mockResolvedValue(facts({ visibility: 'PRIVATE' }));

      await expect(
        resolver.resolve(REPORTER, 'POST', POST),
      ).resolves.toMatchObject({ targetPostId: POST });
      expect(visibility.facts).not.toHaveBeenCalled();
    });
  });
});
