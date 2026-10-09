import { ConflictException, Injectable } from '@nestjs/common';
import type { ActorContext } from '../../common/actor/actor-context.js';
import { AuditService } from '../../common/audit/audit.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { UserAccountService } from '../users/user-account.service.js';
import { AdminTargetService } from './admin-target.service.js';
import type { VerificationDecision } from './dto/verification-decision.dto.js';

// Verificar o rechazar una cuenta institucional (HU50). Cada cuenta tiene una
// sola decisión: solo se decide desde PENDING (spec 0009, decisión 32).
@Injectable()
export class AdminUserVerificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly targets: AdminTargetService,
    private readonly users: UserAccountService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  async decide(
    targetId: string,
    decision: VerificationDecision,
    actor: ActorContext,
  ): Promise<void> {
    await this.targets.check(targetId, actor.userId, { sanction: false });
    await this.prisma.$transaction(async (tx) => {
      const changed = await this.users.decideVerification(
        tx,
        targetId,
        decision,
        new Date(),
      );
      if (!changed) {
        throw new ConflictException({
          message: 'Esta cuenta ya tiene una decisión de verificación',
          code: 'VERIFICATION_ALREADY_DECIDED',
        });
      }
      await this.audit.record(tx, {
        action:
          decision === 'VERIFIED'
            ? 'account.verify'
            : 'account.reject_verification',
        entityType: 'user',
        entityId: targetId,
        actor,
        succeeded: true,
        metadata: { decision },
      });
    });
    // Después de confirmar: el aviso no puede deshacer la decisión.
    await this.notifications.notify({
      recipientId: targetId,
      actorId: null,
      type: 'VERIFICATION_RESULT',
    });
  }
}
