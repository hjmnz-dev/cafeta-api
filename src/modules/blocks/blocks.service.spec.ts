import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { ActorContext } from '../../common/actor/actor-context.js';
import type { AuditService } from '../../common/audit/audit.service.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { MediaUrlService } from '../uploads/media-url.service.js';
import { BlocksService } from './blocks.service.js';

describe('BlocksService', () => {
  let service: BlocksService;
  let prisma: any;
  let audit: any;
  let urls: any;

  const actor: ActorContext = {
    userId: 'u1',
    role: 'STUDENT',
    ip: '127.0.0.1',
    userAgent: 'test-agent',
  };

  beforeEach(() => {
    prisma = {
      $transaction: vi.fn((cb) => cb(prisma)),
      block: {
        findFirst: vi.fn(),
        findUnique: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      follow: {
        updateMany: vi.fn().mockResolvedValue({ count: 2 }),
      },
      user: {
        findFirst: vi.fn(),
      },
    };
    audit = { record: vi.fn().mockResolvedValue(undefined) };
    urls = { urlFor: vi.fn((k) => `https://cdn.example.com/${k}`) };

    service = new BlocksService(
      prisma as unknown as PrismaService,
      audit as unknown as AuditService,
      urls as unknown as MediaUrlService,
    );
  });

  describe('block', () => {
    it('rechaza bloquearse a sí mismo', async () => {
      await expect(service.block('u1', 'u1', actor)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('responde 404 si el usuario no existe o está desactivado', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      await expect(service.block('u2', 'u1', actor)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('es idempotente si el bloqueo ya estaba activo', async () => {
      prisma.user.findFirst.mockResolvedValue({ id: 'u2' });
      const createdAt = new Date('2026-10-01');
      prisma.block.findUnique.mockResolvedValue({
        id: 'b1',
        deactivatedAt: null,
        createdAt,
      });

      const res = await service.block('u2', 'u1', actor);
      expect(res).toEqual({ blocked: true, blockedAt: createdAt });
      expect(prisma.block.create).not.toHaveBeenCalled();
      expect(prisma.follow.updateMany).not.toHaveBeenCalled();
    });

    it('crea bloqueo nuevo, desactiva seguimientos mutuos y audita block.create', async () => {
      prisma.user.findFirst.mockResolvedValue({ id: 'u2' });
      prisma.block.findUnique.mockResolvedValue(null);
      const createdAt = new Date();
      prisma.block.create.mockResolvedValue({
        id: 'b1',
        blockerId: 'u1',
        blockedId: 'u2',
        createdAt,
      });

      const res = await service.block('u2', 'u1', actor);
      expect(res).toEqual({ blocked: true, blockedAt: createdAt });

      expect(prisma.block.create).toHaveBeenCalledWith({
        data: { blockerId: 'u1', blockedId: 'u2' },
      });
      expect(prisma.follow.updateMany).toHaveBeenCalledWith({
        where: {
          OR: [
            { followerId: 'u1', followingId: 'u2' },
            { followerId: 'u2', followingId: 'u1' },
          ],
          deactivatedAt: null,
        },
        data: { deactivatedAt: expect.any(Date) },
      });
      expect(audit.record).toHaveBeenCalledWith(
        prisma,
        expect.objectContaining({
          action: 'block.create',
          entityType: 'block',
          entityId: 'b1',
        }),
      );
    });

    it('reactiva un bloqueo desactivado previamente', async () => {
      prisma.user.findFirst.mockResolvedValue({ id: 'u2' });
      prisma.block.findUnique.mockResolvedValue({
        id: 'b1',
        deactivatedAt: new Date('2026-09-01'),
        createdAt: new Date('2026-08-01'),
      });
      const updatedAt = new Date();
      prisma.block.update.mockResolvedValue({
        id: 'b1',
        deactivatedAt: null,
        updatedAt,
        createdAt: new Date('2026-08-01'),
      });

      const res = await service.block('u2', 'u1', actor);
      expect(res.blocked).toBe(true);
      expect(prisma.block.update).toHaveBeenCalledWith({
        where: { id: 'b1' },
        data: { deactivatedAt: null },
      });
      expect(prisma.follow.updateMany).toHaveBeenCalled();
    });
  });

  describe('unblock', () => {
    it('rechaza desbloquearse a sí mismo', async () => {
      await expect(service.unblock('u1', 'u1', actor)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('responde 404 si no existe un bloqueo activo', async () => {
      prisma.block.findFirst.mockResolvedValue(null);
      await expect(service.unblock('u2', 'u1', actor)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('desactiva el bloqueo y audita block.deactivate', async () => {
      prisma.block.findFirst.mockResolvedValue({
        id: 'b1',
        blockerId: 'u1',
        blockedId: 'u2',
        deactivatedAt: null,
      });

      await service.unblock('u2', 'u1', actor);

      expect(prisma.block.update).toHaveBeenCalledWith({
        where: { id: 'b1' },
        data: { deactivatedAt: expect.any(Date) },
      });
      expect(audit.record).toHaveBeenCalledWith(
        prisma,
        expect.objectContaining({
          action: 'block.deactivate',
          entityType: 'block',
          entityId: 'b1',
        }),
      );
    });
  });

  describe('blockedUsers', () => {
    it('lista usuarios bloqueados y mapea avatar con urlFor', async () => {
      const createdAt = new Date('2026-10-02');
      prisma.block.findMany.mockResolvedValue([
        {
          id: 'b1',
          createdAt,
          blocked: {
            id: 'u2',
            verificationStatus: 'VERIFIED',
            profile: {
              handle: 'mariag',
              displayName: 'María Gómez',
              avatarKey: 'avatars/m.webp',
              career: { name: 'Ingeniería de Software' },
            },
          },
        },
      ]);

      const res = await service.blockedUsers('u1', { limit: 20 });
      expect(res.items).toHaveLength(1);
      expect(res.items[0]).toEqual({
        id: 'u2',
        handle: 'mariag',
        displayName: 'María Gómez',
        avatarUrl: 'https://cdn.example.com/avatars/m.webp',
        careerName: 'Ingeniería de Software',
        verified: true,
        blockedAt: createdAt,
      });
      expect(res.nextCursor).toBeNull();
    });

    it('falla con INVALID_CURSOR si el cursor no pertenece a un bloqueo activo', async () => {
      prisma.block.findFirst.mockResolvedValue(null);
      await expect(
        service.blockedUsers('u1', { limit: 20, cursor: 'invalid-id' }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
