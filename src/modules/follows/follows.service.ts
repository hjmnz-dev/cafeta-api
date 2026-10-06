import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { ACTIVE } from '../../common/soft-delete/soft-delete.js';
import { PrismaService } from '../../prisma/prisma.service.js';

type FollowWriter = Pick<Prisma.TransactionClient, 'follow'>;

export interface FollowCounts {
  followers: number;
  following: number;
}

export interface AcceptedFollow {
  id: string;
  followerId: string;
}

// Dueño de follows. La funcionalidad 16 suma aquí seguir, aceptar y rechazar.
@Injectable()
export class FollowsService {
  constructor(private readonly prisma: PrismaService) {}

  // Seguidores y seguidos con seguimiento aceptado, activo y de cuentas activas.
  async counts(userId: string): Promise<FollowCounts> {
    const [followers, following] = await Promise.all([
      this.prisma.follow.count({
        where: {
          followingId: userId,
          status: 'ACCEPTED',
          deactivatedAt: null,
          follower: ACTIVE,
        },
      }),
      this.prisma.follow.count({
        where: {
          followerId: userId,
          status: 'ACCEPTED',
          deactivatedAt: null,
          following: ACTIVE,
        },
      }),
    ]);
    return { followers, following };
  }

  // Acepta todas las solicitudes pendientes hacia userId (al pasar a PUBLIC,
  // decisión 15). Devuelve los seguimientos que quedaron aceptados.
  async acceptAllPending(
    tx: FollowWriter,
    userId: string,
    now: Date,
  ): Promise<AcceptedFollow[]> {
    const pending = await tx.follow.findMany({
      where: { followingId: userId, status: 'PENDING', deactivatedAt: null },
      select: { id: true, followerId: true },
    });
    if (pending.length === 0) return [];
    await tx.follow.updateMany({
      where: { id: { in: pending.map((f) => f.id) }, status: 'PENDING' },
      data: { status: 'ACCEPTED', respondedAt: now },
    });
    return pending;
  }
}
