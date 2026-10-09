import { Injectable } from '@nestjs/common';
import type { ActorContext } from '../../common/actor/actor-context.js';
import { AccountStateService } from '../account/account-state.service.js';
import { AdminTargetService } from './admin-target.service.js';

// Desactivar y reactivar cuentas desde la consola (HU48 y HU49). El cambio, el
// cierre de sesiones y la bitácora los hace AccountStateService.
@Injectable()
export class AdminUserActionsService {
  constructor(
    private readonly targets: AdminTargetService,
    private readonly state: AccountStateService,
  ) {}

  async deactivate(
    targetId: string,
    reason: string,
    actor: ActorContext,
  ): Promise<void> {
    await this.targets.check(targetId, actor.userId, { sanction: true });
    await this.state.deactivate(targetId, actor, { by: 'admin', reason });
  }

  async reactivate(
    targetId: string,
    reason: string,
    actor: ActorContext,
  ): Promise<void> {
    await this.targets.check(targetId, actor.userId, { sanction: false });
    await this.state.reactivate(targetId, actor, reason);
  }
}
