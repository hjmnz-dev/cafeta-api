import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';

// Las reglas de a quién puede tocar un admin (spec 0009, decisión 32): a nadie
// de su propia cuenta y, al sancionar, a ningún otro admin, para que la
// consola nunca se quede sin acceso.
@Injectable()
export class AdminTargetService {
  constructor(private readonly prisma: PrismaService) {}

  async check(
    targetId: string,
    actorId: string | null,
    options: { sanction: boolean },
  ): Promise<void> {
    const target = await this.prisma.user.findUnique({
      where: { id: targetId },
      select: { id: true, role: true },
    });
    if (!target) {
      throw new NotFoundException({
        message: 'No encontramos a ese usuario',
        code: 'USER_NOT_FOUND',
      });
    }
    if (target.id === actorId) {
      throw new ForbiddenException({
        message: 'Un administrador no puede actuar sobre su propia cuenta',
        code: 'CANNOT_ACT_ON_SELF',
      });
    }
    if (options.sanction && target.role === 'ADMIN') {
      throw new ForbiddenException({
        message: 'No se puede desactivar a otro administrador',
        code: 'CANNOT_SANCTION_ADMIN',
      });
    }
  }
}
