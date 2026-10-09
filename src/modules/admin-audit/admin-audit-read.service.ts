import { BadRequestException, Injectable } from '@nestjs/common';
import { AUDIT_ACTIONS } from '../../common/audit/audit-actions.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { toAuditPage } from './admin-audit-view.mapper.js';
import {
  AUDIT_ORDER,
  AUDIT_SELECT,
  afterAuditCursor,
  auditWhere,
} from './admin-audit-queries.js';
import type { AdminAuditQueryDto } from './dto/admin-audit-query.dto.js';
import type {
  AdminAuditPageDto,
  AuditActionsDto,
} from './dto/admin-audit-view.dto.js';

// Bitácora de la consola (HU45): solo lectura, del más reciente al más
// antiguo y paginada con cursor. Consultarla no deja registro (spec 0009,
// decisión 34).
@Injectable()
export class AdminAuditReadService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: AdminAuditQueryDto): Promise<AdminAuditPageDto> {
    const where = auditWhere(query);
    const after = query.cursor ? await this.afterOf(query.cursor, where) : null;
    const rows = await this.prisma.auditLog.findMany({
      where: after ? { AND: [where, after] } : where,
      orderBy: AUDIT_ORDER,
      take: query.limit + 1,
      select: AUDIT_SELECT,
    });
    return toAuditPage(rows, query.limit);
  }

  actions(): AuditActionsDto {
    return { actions: [...AUDIT_ACTIONS] };
  }

  // El cursor debe ser una fila de esta misma lista, con los mismos filtros.
  private async afterOf(cursor: string, where: Prisma.AuditLogWhereInput) {
    const row = await this.prisma.auditLog.findFirst({
      where: { AND: [{ id: cursor }, where] },
      select: { createdAt: true },
    });
    if (!row) {
      throw new BadRequestException({
        message: 'El cursor no corresponde a ningún elemento de esta lista',
        code: 'INVALID_CURSOR',
      });
    }
    return afterAuditCursor(row.createdAt, cursor);
  }
}
