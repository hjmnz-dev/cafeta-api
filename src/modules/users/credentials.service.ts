import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { ACTIVE } from '../../common/soft-delete/soft-delete.js';
import { PrismaService } from '../../prisma/prisma.service.js';

type UserWriter = Pick<Prisma.TransactionClient, 'user'>;

// Cambios de credenciales de la cuenta, aparte de UsersService para que cada
// clase tenga una sola responsabilidad (spec 0008, decisión 10).
@Injectable()
export class CredentialsService {
  constructor(private readonly prisma: PrismaService) {}

  // Id de la cuenta activa con ese correo; las desactivadas no recuperan contraseña.
  async findActiveIdByEmail(email: string): Promise<string | null> {
    const user = await this.prisma.user.findFirst({
      where: { email, ...ACTIVE },
      select: { id: true },
    });
    return user?.id ?? null;
  }

  async setPasswordHash(
    tx: UserWriter,
    userId: string,
    passwordHash: string,
  ): Promise<void> {
    await tx.user.update({ where: { id: userId }, data: { passwordHash } });
  }
}
