import {
  Controller,
  Get,
  Param,
  Query,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { ActorContext } from '../../common/actor/actor-context.js';
import { Actor } from '../../common/actor/actor.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { AdminReportsService } from './admin-reports.service.js';
import {
  ReportKindParamDto,
  ReportRangeQueryDto,
} from './dto/report-query.dto.js';
import { ReportTableDto } from './dto/report-table.dto.js';

@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin/reports')
@Roles('ADMIN')
@UseGuards(RolesGuard)
@ApiUnauthorizedResponse({ description: 'Sin sesión' })
@ApiForbiddenResponse({ description: 'La cuenta no es admin: FORBIDDEN' })
export class AdminReportsController {
  constructor(private readonly reports: AdminReportsService) {}

  @Get(':kind')
  @ApiOperation({
    summary: 'Genera un informe (actividad o moderación) para ver en pantalla',
  })
  @ApiOkResponse({ type: ReportTableDto })
  @ApiBadRequestResponse({
    description: 'INVALID_DATE_RANGE, RANGE_TOO_LARGE o VALIDATION_ERROR',
  })
  generate(
    @Param() { kind }: ReportKindParamDto,
    @Query() range: ReportRangeQueryDto,
    @Actor() actor: ActorContext,
  ): Promise<ReportTableDto> {
    return this.reports.generate(kind, range, actor);
  }

  @Get(':kind/csv')
  @ApiOperation({
    summary: 'Descarga el informe en CSV (UTF 8 con BOM, abre bien en Excel)',
  })
  @ApiProduces('text/csv')
  @ApiOkResponse({ description: 'Archivo CSV', schema: { type: 'string' } })
  @ApiBadRequestResponse({
    description: 'INVALID_DATE_RANGE, RANGE_TOO_LARGE o VALIDATION_ERROR',
  })
  async download(
    @Param() { kind }: ReportKindParamDto,
    @Query() range: ReportRangeQueryDto,
    @Actor() actor: ActorContext,
  ): Promise<StreamableFile> {
    const { fileName, content } = await this.reports.download(
      kind,
      range,
      actor,
    );
    return new StreamableFile(Buffer.from(content, 'utf-8'), {
      type: 'text/csv; charset=utf-8',
      disposition: `attachment; filename="${fileName}"`,
    });
  }
}
