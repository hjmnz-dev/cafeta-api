import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { stateChangeArgs } from '../../common/soft-delete/soft-delete.js';
import { PrismaService } from '../../prisma/prisma.service.js';

type UserWriter = Pick<Prisma.TransactionClient, 'user'>;

// Lo que cambia el estado de una cuenta en la tabla users (spec 0009, decisión
// 11). Vive aparte de UsersService para que cada clase se quede corta.
@Injectable()
export class UserAccountService {
  constructor(private readonly prisma: PrismaService) {}

  // Para pedir la contraseña otra vez a quien ya tiene sesión.
  findHashById(id: string): Promise<{ passwordHash: string } | null> {
    return this.prisma.user.findUnique({
      where: { id },
      select: { passwordHash: true },
    });
  }

  // Baja lógica de la cuenta; false si ya estaba desactivada (spec 0003).
  async deactivate(tx: UserWriter, id: string, now: Date): Promise<boolean> {
    const { count } = await tx.user.updateMany(
      stateChangeArgs(id, 'deactivate', now),
    );
    return count > 0;
  }

  // Reactiva la cuenta; false si ya estaba activa. El historial no se toca.
  async reactivate(tx: UserWriter, id: string, now: Date): Promise<boolean> {
    const { count } = await tx.user.updateMany(
      stateChangeArgs(id, 'reactivate', now),
    );
    return count > 0;
  }

  // Decide la verificación solo si seguía PENDING; false si ya tenía decisión.
  async decideVerification(
    tx: UserWriter,
    id: string,
    decision: 'VERIFIED' | 'REJECTED',
    now: Date,
  ): Promise<boolean> {
    const { count } = await tx.user.updateMany({
      where: { id, verificationStatus: 'PENDING' },
      data: {
        verificationStatus: decision,
        verifiedAt: decision === 'VERIFIED' ? now : null,
      },
    });
    return count > 0;
  }
}
