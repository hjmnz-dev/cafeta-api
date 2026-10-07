import { Injectable } from '@nestjs/common';
import type { Prisma, Role } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';

const HOUR_MS = 60 * 60 * 1000;
export const SESSION_TTL_MS = 12 * HOUR_MS;
export const REMEMBER_TTL_MS = 30 * 24 * HOUR_MS;

export interface NewSession {
  userId: string;
  remember: boolean;
  ip: string | null;
  userAgent: string | null;
}

export interface IssuedSession {
  id: string;
  expiresAt: Date;
}

export interface ValidSession {
  id: string;
  userId: string;
  role: Role;
}

type SessionWriter = Pick<Prisma.TransactionClient, 'session'>;

// Dueño de la tabla sessions (spec 0004): crear, buscar vigente y revocar.
@Injectable()
export class SessionsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    tx: SessionWriter,
    data: NewSession,
    now: Date,
  ): Promise<IssuedSession> {
    const ttl = data.remember ? REMEMBER_TTL_MS : SESSION_TTL_MS;
    return tx.session.create({
      data: { ...data, expiresAt: new Date(now.getTime() + ttl) },
      select: { id: true, expiresAt: true },
    });
  }

  // Vigente = existe, no está revocada, no venció y su usuario sigue activo.
  async findValid(id: string, now: Date): Promise<ValidSession | null> {
    const session = await this.prisma.session.findFirst({
      where: {
        id,
        revokedAt: null,
        expiresAt: { gt: now },
        user: { deactivatedAt: null },
      },
      select: { id: true, userId: true, user: { select: { role: true } } },
    });
    return session
      ? { id: session.id, userId: session.userId, role: session.user.role }
      : null;
  }

  // Cierra todas las sesiones abiertas de una cuenta (al cambiar la contraseña).
  async revokeAllForUser(
    tx: SessionWriter,
    userId: string,
    now: Date,
  ): Promise<void> {
    await tx.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: now },
    });
  }

  async revoke(id: string, now: Date): Promise<void> {
    await this.prisma.session.updateMany({
      where: { id, revokedAt: null },
      data: { revokedAt: now },
    });
  }

  // Cierra todas las sesiones de un usuario (al desactivar su cuenta). Va en la
  // transacción de quien la llama, para que no quede una sin la otra.
  async revokeAllForUser(
    tx: SessionWriter,
    userId: string,
    now: Date,
  ): Promise<void> {
    await tx.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: now },
    });
  }
}
