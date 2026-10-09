import { Injectable } from '@nestjs/common';
import type { Prisma, Role } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  generateResetToken,
  hashToken,
  RESET_TOKEN_TTL_MS,
} from './reset-token.js';

export interface UsableToken {
  id: string;
  userId: string;
  role: Role;
}

type TokenWriter = Pick<Prisma.TransactionClient, 'passwordResetToken'>;

// Dueño de la tabla password_reset_tokens (spec 0008, decisión 10). Solo guarda
// el hash del token; el token en claro nunca toca la base.
@Injectable()
export class ResetTokensService {
  constructor(private readonly prisma: PrismaService) {}

  // Pedir un enlace nuevo invalida los anteriores: los marca como usados.
  async issue(userId: string, now: Date): Promise<string> {
    const { token, hash } = generateResetToken();
    await this.prisma.$transaction([
      this.prisma.passwordResetToken.updateMany({
        where: { userId, usedAt: null },
        data: { usedAt: now },
      }),
      this.prisma.passwordResetToken.create({
        data: {
          userId,
          tokenHash: hash,
          expiresAt: new Date(now.getTime() + RESET_TOKEN_TTL_MS),
        },
      }),
    ]);
    return token;
  }

  // Sirve si existe, no se usó, no venció y su cuenta sigue activa. Desconocido,
  // usado y vencido son lo mismo para quien llama: null.
  async findUsable(token: string, now: Date): Promise<UsableToken | null> {
    const row = await this.prisma.passwordResetToken.findFirst({
      where: {
        tokenHash: hashToken(token),
        usedAt: null,
        expiresAt: { gt: now },
        user: { deactivatedAt: null },
      },
      select: { id: true, userId: true, user: { select: { role: true } } },
    });
    return row ? { id: row.id, userId: row.userId, role: row.user.role } : null;
  }

  // Marca el token como usado solo si sigue libre: dos usos a la vez, gana uno.
  async consume(tx: TokenWriter, id: string, now: Date): Promise<boolean> {
    const { count } = await tx.passwordResetToken.updateMany({
      where: { id, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    return count === 1;
  }
}
