import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import type { ActorContext } from '../../common/actor/actor-context.js';
import { AuditService } from '../../common/audit/audit.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { CreateReportDto } from './dto/create-report.dto.js';
import type { ReportViewDto } from './dto/report-view.dto.js';
import { ReportTargetResolver } from './report-target.resolver.js';

const REPORT_VIEW_SELECT = {
  id: true,
  targetType: true,
  reason: true,
  status: true,
  createdAt: true,
} satisfies Prisma.ReportSelect;

const detailsRequired = () =>
  new BadRequestException({
    message: 'Cuéntanos más: el motivo "Otro" necesita un detalle',
    code: 'DETAILS_REQUIRED',
  });

const alreadyPending = () =>
  new ConflictException({
    message: 'Ya reportaste esto, un administrador lo está revisando',
    code: 'REPORT_ALREADY_PENDING',
  });

// Dos envíos a la vez: gana uno y el otro choca con la unicidad de pending_key.
const isUniqueViolation = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  error.code === 'P2002';

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly targets: ReportTargetResolver,
  ) {}

  // Guarda el reporte (HU55, HU56) y lo audita en la misma transacción. No avisa
  // al reportado (decisión 30).
  async create(
    reporterId: string,
    dto: CreateReportDto,
    actor: ActorContext,
  ): Promise<ReportViewDto> {
    if (dto.reason === 'OTHER' && !dto.details) throw detailsRequired();
    const target = await this.targets.resolve(
      reporterId,
      dto.targetType,
      dto.targetId,
    );

    try {
      const row = await this.prisma.$transaction(async (tx) => {
        const created = await tx.report.create({
          data: {
            reporterId,
            targetType: dto.targetType,
            targetUserId: target.targetUserId,
            targetPostId: target.targetPostId,
            targetSnapshot: target.targetSnapshot,
            reason: dto.reason,
            details: dto.details ?? null,
            pendingKey: target.pendingKey,
          },
          select: REPORT_VIEW_SELECT,
        });
        await this.audit.record(tx, {
          action: 'report.create',
          entityType: 'report',
          entityId: created.id,
          actor,
          succeeded: true,
          metadata: {
            targetType: dto.targetType,
            targetId: dto.targetId,
            reason: dto.reason,
          },
        });
        return created;
      });
      return { ...row, targetId: dto.targetId };
    } catch (error) {
      throw isUniqueViolation(error) ? alreadyPending() : error;
    }
  }
}
