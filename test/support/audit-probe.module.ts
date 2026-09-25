import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Injectable,
  Module,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { Actor } from '../../src/common/actor/actor.decorator.js';
import type { ActorContext } from '../../src/common/actor/actor-context.js';
import { AdminReasonDto } from '../../src/common/audit/admin-reason.dto.js';
import { AuditModule } from '../../src/common/audit/audit.module.js';
import { AuditService } from '../../src/common/audit/audit.service.js';
import {
  ACTIVE,
  stateChangeArgs,
  stateChangeError,
  type StateChange,
} from '../../src/common/soft-delete/soft-delete.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';

// Módulo que existe solo en las e2e (spec 0003): recorre el patrón completo de
// desactivar, reactivar y auditar sobre la tabla careers, sin código de prueba
// en producción.
@Injectable()
class ProbeCareersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list() {
    return this.prisma.career.findMany({
      where: ACTIVE,
      orderBy: { name: 'asc' },
    });
  }

  async change(
    id: string,
    change: StateChange,
    actor: ActorContext,
    metadata: { by: 'admin' | 'self'; reason?: string },
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.career.updateMany(
        stateChangeArgs(id, change, new Date()),
      );
      if (count === 1) {
        await this.audit.record(tx, {
          action:
            change === 'deactivate' ? 'career.deactivate' : 'career.reactivate',
          entityType: 'career',
          entityId: id,
          actor,
          succeeded: true,
          metadata,
        });
        return;
      }
      const exists = (await tx.career.count({ where: { id } })) > 0;
      throw stateChangeError(exists, change);
    });
  }
}

@Controller('__probe__')
class ProbeController {
  constructor(private readonly careers: ProbeCareersService) {}

  @Get('careers')
  list() {
    return this.careers.list();
  }

  @Post('admin/careers/:id/deactivate')
  @HttpCode(204)
  adminDeactivate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdminReasonDto,
    @Actor() actor: ActorContext,
  ): Promise<void> {
    return this.careers.change(id, 'deactivate', actor, {
      by: 'admin',
      reason: dto.reason,
    });
  }

  @Post('admin/careers/:id/reactivate')
  @HttpCode(204)
  adminReactivate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdminReasonDto,
    @Actor() actor: ActorContext,
  ): Promise<void> {
    return this.careers.change(id, 'reactivate', actor, {
      by: 'admin',
      reason: dto.reason,
    });
  }

  @Post('careers/:id/deactivate')
  @HttpCode(204)
  selfDeactivate(
    @Param('id', ParseUUIDPipe) id: string,
    @Actor() actor: ActorContext,
  ): Promise<void> {
    return this.careers.change(id, 'deactivate', actor, { by: 'self' });
  }

  @Get('forbidden')
  forbidden(): never {
    throw new ForbiddenException();
  }
}

@Module({
  imports: [AuditModule],
  controllers: [ProbeController],
  providers: [ProbeCareersService],
})
export class AuditProbeModule {}
