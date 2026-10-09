import { BadRequestException, Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  ADMIN_USER_ORDER,
  ADMIN_USER_SELECT,
  adminUsersWhere,
  afterUserCursor,
} from './admin-user-queries.js';
import { toAdminUserPage } from './admin-user-view.mapper.js';
import type { AdminUserPageDto } from './dto/admin-user-view.dto.js';
import type { AdminUsersQueryDto } from './dto/admin-users-query.dto.js';

// Lista de usuarios de la consola (HU47): filtros, del más nuevo al más
// antiguo y paginada con cursor.
@Injectable()
export class AdminUsersReadService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: AdminUsersQueryDto): Promise<AdminUserPageDto> {
    const where = adminUsersWhere(query);
    const after = query.cursor ? await this.afterOf(query.cursor, where) : null;
    const rows = await this.prisma.user.findMany({
      where: after ? { AND: [where, after] } : where,
      orderBy: ADMIN_USER_ORDER,
      take: query.limit + 1,
      select: ADMIN_USER_SELECT,
    });
    return toAdminUserPage(rows, query.limit);
  }

  // El cursor debe ser una fila de esta misma lista, con los mismos filtros.
  private async afterOf(cursor: string, where: Prisma.UserWhereInput) {
    const row = await this.prisma.user.findFirst({
      where: { AND: [{ id: cursor }, where] },
      select: { createdAt: true },
    });
    if (!row) {
      throw new BadRequestException({
        message: 'El cursor no corresponde a ningún elemento de esta lista',
        code: 'INVALID_CURSOR',
      });
    }
    return afterUserCursor(row.createdAt, cursor);
  }
}
