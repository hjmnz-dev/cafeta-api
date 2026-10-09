import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { ActorContext } from '../../common/actor/actor-context.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AdminTargetService } from '../admin-users/admin-target.service.js';
import type { ResolveReportDto } from './dto/resolve-report.dto.js';
import { ReportClosingService } from './report-closing.service.js';
import { ReportSanctionService } from './report-sanction.service.js';

const NOTE_MIN = 3;

const REPORT_TO_RESOLVE_SELECT = {
  id: true,
  status: true,
  targetUserId: true,
  targetPostId: true,
  targetUser: { select: { deactivatedAt: true } },
  targetPost: { select: { deactivatedAt: true, authorId: true } },
} as const;

// Resolver un reporte (HU51, HU52; spec 0009, decisión 33): desestimar cierra
// solo ese; sancionar desactiva al objetivo y cierra todos los pendientes
// sobre él. La cuenta y el reporte cambian en la misma transacción.
@Injectable()
export class AdminReportResolveService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly targets: AdminTargetService,
    private readonly closing: ReportClosingService,
    private readonly sanctions: ReportSanctionService,
  ) {}

  async resolve(
    id: string,
    dto: ResolveReportDto,
    actor: ActorContext,
  ): Promise<void> {
    const report = await this.pending(id);
    if (dto.action === 'DISMISS') {
      await this.prisma.$transaction((tx) =>
        this.closing.close(tx, report, 'DISMISSED', dto.note, actor),
      );
      return;
    }
    const note = this.requiredNote(dto.note);
    // A quien se sanciona: la cuenta reportada o el autor de la publicación.
    // Nunca a uno mismo ni a otro admin (mismos códigos de la 32).
    const subjectId = report.targetUserId ?? report.targetPost?.authorId;
    if (subjectId) {
      await this.targets.check(subjectId, actor.userId, { sanction: true });
    }
    await this.prisma.$transaction(async (tx) => {
      await this.closing.close(tx, report, 'SANCTIONED', note, actor);
      await this.sanctions.apply(tx, report, note, actor);
      await this.closing.closeSiblings(tx, report, note, actor);
    });
  }

  private requiredNote(note: string | undefined): string {
    if (!note || note.length < NOTE_MIN) {
      throw new BadRequestException({
        message: `Escribe la nota de la sanción (al menos ${NOTE_MIN} caracteres)`,
        code: 'NOTE_REQUIRED',
      });
    }
    return note;
  }

  private async pending(id: string) {
    const report = await this.prisma.report.findUnique({
      where: { id },
      select: REPORT_TO_RESOLVE_SELECT,
    });
    if (!report) {
      throw new NotFoundException({
        message: 'No encontramos ese reporte',
        code: 'REPORT_NOT_FOUND',
      });
    }
    if (report.status !== 'PENDING') {
      throw new ConflictException({
        message: 'Este reporte ya fue resuelto',
        code: 'REPORT_ALREADY_RESOLVED',
      });
    }
    return report;
  }
}
