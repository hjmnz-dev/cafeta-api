import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import type { ActorContext } from '../../common/actor/actor-context.js';
import { AuditService } from '../../common/audit/audit.service.js';
import { AccountStateService } from '../account/account-state.service.js';
import { PostModerationService } from '../posts/post-moderation.service.js';

export interface SanctionTarget {
  id: string;
  targetUserId: string | null;
  targetPostId: string | null;
  targetUser: { deactivatedAt: Date | null } | null;
  targetPost: { deactivatedAt: Date | null } | null;
}

// Lo que "Desactivar" hace sobre el objetivo reportado (spec 0009, decisión
// 33). Si ya estaba inactivo o la publicación ya no existe no cambia nada: el
// reporte igual se cierra como sancionado.
@Injectable()
export class ReportSanctionService {
  constructor(
    private readonly accounts: AccountStateService,
    private readonly posts: PostModerationService,
    private readonly audit: AuditService,
  ) {}

  async apply(
    tx: Prisma.TransactionClient,
    report: SanctionTarget,
    reason: string,
    actor: ActorContext,
  ): Promise<void> {
    if (report.targetUserId && report.targetUser?.deactivatedAt === null) {
      await this.accounts.deactivateIn(tx, report.targetUserId, actor, {
        by: 'admin',
        reason,
      });
      return;
    }
    if (report.targetPostId && report.targetPost?.deactivatedAt === null) {
      const changed = await this.posts.deactivate(
        tx,
        report.targetPostId,
        new Date(),
      );
      if (!changed) return;
      await this.audit.record(tx, {
        action: 'post.deactivate',
        entityType: 'post',
        entityId: report.targetPostId,
        actor,
        succeeded: true,
        metadata: { by: 'admin', reason, reportId: report.id },
      });
    }
  }
}
