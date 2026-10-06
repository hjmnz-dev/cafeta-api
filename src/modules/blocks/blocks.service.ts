import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import type { ActorContext } from '../../common/actor/actor-context.js';
import { AuditService } from '../../common/audit/audit.service.js';
import { ACTIVE } from '../../common/soft-delete/soft-delete.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { PageQueryDto } from '../posts/dto/page-query.dto.js';
import { MediaUrlService } from '../uploads/media-url.service.js';
import {
  afterBlockCursor,
  BLOCK_ORDER,
  BLOCKED_USER_CARD_SELECT,
  toBlockedUserPage,
  type BlockRow,
} from './block-queries.js';
import type {
  BlockedUserPageDto,
  BlockStatusViewDto,
} from './dto/block-view.dto.js';

@Injectable()
export class BlocksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly urls: MediaUrlService,
  ) {}

  /**
   * Bloquea a un usuario: desactiva seguimientos en ambas direcciones (decisión 29)
   * y registra auditoría. Si ya estaba bloqueado, es idempotente.
   */
  async block(
    targetUserId: string,
    currentUserId: string,
    actor: ActorContext,
  ): Promise<BlockStatusViewDto> {
    if (targetUserId.toLowerCase() === currentUserId.toLowerCase()) {
      throw new BadRequestException({
        message: 'No puedes bloquearte a ti mismo',
        code: 'CANNOT_BLOCK_SELF',
      });
    }

    const target = await this.prisma.user.findFirst({
      where: { id: targetUserId, ...ACTIVE },
      select: { id: true },
    });
    if (!target) {
      throw new NotFoundException({
        message: 'El usuario no existe',
        code: 'USER_NOT_FOUND',
      });
    }

    const existing = await this.prisma.block.findUnique({
      where: {
        blockerId_blockedId: {
          blockerId: currentUserId,
          blockedId: targetUserId,
        },
      },
    });

    if (existing && existing.deactivatedAt === null) {
      return {
        blocked: true,
        blockedAt: existing.createdAt,
      };
    }

    const now = new Date();
    const blockRow = await this.prisma.$transaction(async (tx) => {
      let row;
      if (existing) {
        row = await tx.block.update({
          where: { id: existing.id },
          data: { deactivatedAt: null },
        });
      } else {
        row = await tx.block.create({
          data: {
            blockerId: currentUserId,
            blockedId: targetUserId,
          },
        });
      }

      // Al bloquear se desactivan los seguimientos en ambos sentidos (decisión 29).
      await tx.follow.updateMany({
        where: {
          OR: [
            { followerId: currentUserId, followingId: targetUserId },
            { followerId: targetUserId, followingId: currentUserId },
          ],
          deactivatedAt: null,
        },
        data: {
          deactivatedAt: now,
        },
      });

      await this.audit.record(tx, {
        action: 'block.create',
        entityType: 'block',
        entityId: row.id,
        actor,
        succeeded: true,
        metadata: { blockedUserId: targetUserId },
      });

      return row;
    });

    return {
      blocked: true,
      blockedAt: blockRow.createdAt,
    };
  }

  /**
   * Desbloquea a un usuario (baja lógica de la fila en blocks).
   * No restaura seguimientos previos (decisión 29).
   */
  async unblock(
    targetUserId: string,
    currentUserId: string,
    actor: ActorContext,
  ): Promise<void> {
    if (targetUserId.toLowerCase() === currentUserId.toLowerCase()) {
      throw new BadRequestException({
        message: 'No puedes desbloquearte a ti mismo',
        code: 'CANNOT_BLOCK_SELF',
      });
    }

    const existing = await this.prisma.block.findFirst({
      where: {
        blockerId: currentUserId,
        blockedId: targetUserId,
        deactivatedAt: null,
      },
    });

    if (!existing) {
      throw new NotFoundException({
        message: 'No has bloqueado a este usuario',
        code: 'BLOCK_NOT_FOUND',
      });
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.block.update({
        where: { id: existing.id },
        data: { deactivatedAt: new Date() },
      });

      await this.audit.record(tx, {
        action: 'block.deactivate',
        entityType: 'block',
        entityId: existing.id,
        actor,
        succeeded: true,
        metadata: { unblockedUserId: targetUserId },
      });
    });
  }

  /**
   * Lista paginada de usuarios bloqueados por el usuario autenticado (para Configuración).
   */
  async blockedUsers(
    currentUserId: string,
    { cursor, limit }: PageQueryDto,
  ): Promise<BlockedUserPageDto> {
    const where: Prisma.BlockWhereInput = {
      blockerId: currentUserId,
      deactivatedAt: null,
      blocked: ACTIVE,
    };

    const after = cursor
      ? await this.afterBlockOf(cursor, currentUserId)
      : null;

    const rows = await this.prisma.block.findMany({
      where: after ? { AND: [where, after] } : where,
      orderBy: BLOCK_ORDER,
      take: limit + 1,
      select: {
        id: true,
        createdAt: true,
        blocked: {
          select: BLOCKED_USER_CARD_SELECT,
        },
      },
    });

    return toBlockedUserPage(rows as unknown as BlockRow[], limit, (key) =>
      this.urls.urlFor(key),
    );
  }

  private async afterBlockOf(cursor: string, currentUserId: string) {
    const row = await this.prisma.block.findFirst({
      where: { id: cursor, blockerId: currentUserId, deactivatedAt: null },
      select: { id: true, createdAt: true },
    });
    if (!row) {
      throw new BadRequestException({
        message: 'El cursor no corresponde a ningún elemento de esta lista',
        code: 'INVALID_CURSOR',
      });
    }
    return afterBlockCursor(row.createdAt, row.id);
  }
}
