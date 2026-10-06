import { Injectable } from '@nestjs/common';
import type { ActorContext } from '../../common/actor/actor-context.js';
import { AuditService } from '../../common/audit/audit.service.js';

export const TEST_ERROR_MESSAGE = 'Prueba de monitoreo forzada por un admin';

// Error forzado para comprobar el monitoreo en producción (spec 0007, AC-4).
@Injectable()
export class MonitoringService {
  constructor(private readonly audit: AuditService) {}

  async forceTestError(actor: ActorContext): Promise<never> {
    await this.audit.recordStandalone({
      action: 'monitoring.test',
      entityType: 'monitoring',
      actor,
      succeeded: true,
    });
    throw new Error(TEST_ERROR_MESSAGE);
  }
}
