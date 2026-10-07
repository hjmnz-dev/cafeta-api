import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { ActorContext } from '../../common/actor/actor-context.js';
import type { AuditService } from '../../common/audit/audit.service.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { NotificationsService } from '../notifications/notifications.service.js';
import type { MediaUrlService } from '../uploads/media-url.service.js';
import type { VisibilityService } from '../visibility/visibility.service.js';
import { FollowsService } from './follows.service.js';

describe('FollowsService', () => {
  let service: FollowsService;
  let prisma: any;
  let audit: any;
  let visibility: any;
  let urls: any;
  let notifications: any;

  const actor: ActorContext = {
    userId: 'u1',
    role: 'STUDENT',
    ip: '127.0.0.1',
    userAgent: 'test-agent',
  };

  beforeEach(() => {
    prisma = {
      $transaction: vi.fn((cb) => cb(prisma)),
      follow: {
        count: vi.fn(),
        findFirst: vi.fn(),
        findUnique: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
      user: {
        findFirst: vi.fn(),
        findUnique: vi.fn(),
      },
    };
    audit = { record: vi.fn().mockResolvedValue(undefined) };
    visibility = {
      visibleProfileFacts: vi.fn(),
    };
    urls = { urlFor: vi.fn((k) => `https://cdn.example.com/${k}`) };
    notifications = { notify: vi.fn().mockResolvedValue(undefined) };

    service = new FollowsService(
      prisma as unknown as PrismaService,
      audit as unknown as AuditService,
      visibility as unknown as VisibilityService,
      urls as unknown as MediaUrlService,
      notifications as unknown as NotificationsService,
    );
  });

  describe('follow', () => {
    it('rechaza seguirse a sí mismo', async () => {
      await expect(service.follow('u1', 'u1', actor)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('responde 404 si el usuario no existe', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      await expect(service.follow('u2', 'u1', actor)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('responde 404 si hay bloqueo mutuo', async () => {
      prisma.user.findFirst.mockResolvedValue({
        id: 'u2',
        profile: { visibility: 'PUBLIC' },
        blocksMade: [{ id: 'b1' }],
        blocksReceived: [],
      });
      await expect(service.follow('u2', 'u1', actor)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('responde 403 si el perfil es PRIVATE', async () => {
      prisma.user.findFirst.mockResolvedValue({
        id: 'u2',
        profile: { visibility: 'PRIVATE' },
        blocksMade: [],
        blocksReceived: [],
      });
      await expect(service.follow('u2', 'u1', actor)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('con perfil PUBLIC crea follow ACCEPTED de inmediato y audita', async () => {
      prisma.user.findFirst.mockResolvedValue({
        id: 'u2',
        profile: { visibility: 'PUBLIC' },
        blocksMade: [],
        blocksReceived: [],
      });
      prisma.follow.findUnique.mockResolvedValue(null);
      prisma.follow.create.mockResolvedValue({ id: 'f1', status: 'ACCEPTED' });

      const res = await service.follow('u2', 'u1', actor);

      expect(res).toEqual({ id: 'f1', status: 'ACCEPTED' });
      expect(prisma.follow.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            followerId: 'u1',
            followingId: 'u2',
            status: 'ACCEPTED',
          }),
        }),
      );
      expect(audit.record).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ action: 'follow.create' }),
      );
      expect(notifications.notify).toHaveBeenCalledWith({
        type: 'FOLLOW',
        recipientId: 'u2',
        actorId: 'u1',
      });
    });

    it('con perfil FOLLOWERS crea follow PENDING y audita', async () => {
      prisma.user.findFirst.mockResolvedValue({
        id: 'u2',
        profile: { visibility: 'FOLLOWERS' },
        blocksMade: [],
        blocksReceived: [],
      });
      prisma.follow.findUnique.mockResolvedValue(null);
      prisma.follow.create.mockResolvedValue({ id: 'f1', status: 'PENDING' });

      const res = await service.follow('u2', 'u1', actor);

      expect(res).toEqual({ id: 'f1', status: 'PENDING' });
      expect(prisma.follow.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'PENDING',
          }),
        }),
      );
      expect(notifications.notify).toHaveBeenCalledWith({
        type: 'FOLLOW_REQUEST',
        recipientId: 'u2',
        actorId: 'u1',
      });
    });

    it('si existía una fila desactivada, la reactiva', async () => {
      prisma.user.findFirst.mockResolvedValue({
        id: 'u2',
        profile: { visibility: 'PUBLIC' },
        blocksMade: [],
        blocksReceived: [],
      });
      prisma.follow.findUnique.mockResolvedValue({
        id: 'f1',
        deactivatedAt: new Date('2026-01-01'),
        status: 'ACCEPTED',
      });
      prisma.follow.update.mockResolvedValue({ id: 'f1', status: 'ACCEPTED' });

      const res = await service.follow('u2', 'u1', actor);

      expect(res).toEqual({ id: 'f1', status: 'ACCEPTED' });
      expect(prisma.follow.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'f1' },
          data: expect.objectContaining({
            deactivatedAt: null,
            status: 'ACCEPTED',
          }),
        }),
      );
    });
  });

  describe('unfollow', () => {
    it('deja de seguir mediante baja lógica y audita', async () => {
      prisma.follow.findFirst.mockResolvedValue({ id: 'f1' });

      await service.unfollow('u2', 'u1', actor);

      expect(prisma.follow.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'f1' },
          data: expect.objectContaining({
            deactivatedAt: expect.any(Date),
          }),
        }),
      );
      expect(audit.record).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ action: 'follow.deactivate' }),
      );
    });

    it('lanza 404 si no lo seguía', async () => {
      prisma.follow.findFirst.mockResolvedValue(null);
      await expect(service.unfollow('u2', 'u1', actor)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('accept', () => {
    it('acepta solicitud pendiente y audita', async () => {
      prisma.follow.findFirst.mockResolvedValue({
        id: 'f1',
        followerId: 'u2',
        followingId: 'u1',
        status: 'PENDING',
      });

      await service.accept('f1', 'u1', actor);

      expect(prisma.follow.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'f1' },
          data: expect.objectContaining({
            status: 'ACCEPTED',
            respondedAt: expect.any(Date),
          }),
        }),
      );
      expect(audit.record).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ action: 'follow.accept' }),
      );
      expect(notifications.notify).toHaveBeenCalledWith({
        type: 'FOLLOW_ACCEPTED',
        recipientId: 'u2',
        actorId: 'u1',
      });
    });
  });

  describe('reject', () => {
    it('rechaza solicitud con baja lógica y audita', async () => {
      prisma.follow.findFirst.mockResolvedValue({
        id: 'f1',
        followerId: 'u2',
        followingId: 'u1',
        status: 'PENDING',
      });

      await service.reject('f1', 'u1', actor);

      expect(prisma.follow.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'f1' },
          data: expect.objectContaining({
            deactivatedAt: expect.any(Date),
          }),
        }),
      );
      expect(audit.record).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ action: 'follow.reject' }),
      );
    });
  });
});
