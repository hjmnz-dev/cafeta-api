import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import type { ActorContext } from '../../common/actor/actor-context.js';
import { AuditService } from '../../common/audit/audit.service.js';
import { stateChangeError } from '../../common/soft-delete/soft-delete.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { SessionsService } from '../auth/sessions.service.js';
import { UserAccountService } from '../users/user-account.service.js';

export interface DeactivationOrigin {
  /** Quién decidió la baja: la propia persona o un administrador. */
  by: 'self' | 'admin';
  reason?: string;
}

// El único lugar que desactiva una cuenta (spec 0009, decisión 11): baja
// lógica, sesiones cerradas y auditoría, todo en la misma transacción. La baja
// voluntaria (11) y las de admin (32 y 33) pasan por aquí.
@Injectable()
export class AccountStateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UserAccountService,
    private readonly sessions: SessionsService,
    private readonly audit: AuditService,
  ) {}

  async deactivate(
    userId: string,
    actor: ActorContext,
    origin: DeactivationOrigin,
  ): Promise<void> {
    await this.prisma.$transaction((tx) =>
      this.deactivateIn(tx, userId, actor, origin),
    );
  }

  // Lo mismo dentro de una transacción ajena: la revisión de reportes (33)
  // cierra el reporte y desactiva la cuenta o ninguno de los dos.
  async deactivateIn(
    tx: Prisma.TransactionClient,
    userId: string,
    actor: ActorContext,
    origin: DeactivationOrigin,
  ): Promise<void> {
    const now = new Date();
    if (!(await this.users.deactivate(tx, userId, now))) {
      throw stateChangeError(true, 'deactivate');
    }
    await this.sessions.revokeAllForUser(tx, userId, now);
    await this.audit.record(tx, {
      action: 'account.deactivate',
      entityType: 'user',
      entityId: userId,
      actor,
      succeeded: true,
      metadata: {
        by: origin.by,
        ...(origin.reason ? { reason: origin.reason } : {}),
      },
    });
  }

  // Reactivar es cosa del admin (32 y 33): la cuenta vuelve con su historial y
  // sus sesiones siguen cerradas, así que entra con una nueva.
  async reactivate(
    userId: string,
    actor: ActorContext,
    reason: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      if (!(await this.users.reactivate(tx, userId, new Date()))) {
        throw stateChangeError(true, 'reactivate');
      }
      await this.audit.record(tx, {
        action: 'account.reactivate',
        entityType: 'user',
        entityId: userId,
        actor,
        succeeded: true,
        metadata: { by: 'admin', reason },
      });
    });
  }
}
