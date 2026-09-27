import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { ActorContext } from '../actor/actor-context.js';
import type { AuditAction, AuditEntityType } from './audit-actions.js';

export interface AuditEntry {
  action: AuditAction;
  entityType: AuditEntityType;
  entityId?: string | null;
  actor: ActorContext;
  succeeded: boolean;
  metadata?: Prisma.InputJsonObject;
}

type AuditWriter = Pick<Prisma.TransactionClient, 'auditLog'>;

// Escribe la bitácora (spec 0003). record() va dentro de la transacción del
// cambio, así ninguna acción se confirma sin su entrada.
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  // Deja pasar cualquier error: la transacción que la llama se deshace.
  async record(tx: AuditWriter, entry: AuditEntry): Promise<void> {
    await tx.auditLog.create({ data: toRow(entry) });
  }

  // Solo para access.denied: nunca lanza, para no cambiar la respuesta.
  async recordStandalone(entry: AuditEntry): Promise<void> {
    try {
      await this.prisma.auditLog.create({ data: toRow(entry) });
    } catch (error) {
      this.logger.error(
        `No se pudo auditar ${entry.action}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

function toRow(entry: AuditEntry): Prisma.AuditLogUncheckedCreateInput {
  return {
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId ?? null,
    succeeded: entry.succeeded,
    metadata: entry.metadata,
    actorId: entry.actor.userId,
    actorRole: entry.actor.role,
    ip: entry.actor.ip,
    userAgent: entry.actor.userAgent,
  };
}
