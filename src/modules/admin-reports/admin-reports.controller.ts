import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Actor } from '../../common/actor/actor.decorator.js';
import type { ActorContext } from '../../common/actor/actor-context.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { AdminReportResolveService } from './admin-report-resolve.service.js';
import { AdminReportsReadService } from './admin-reports-read.service.js';
import {
  AdminReportDetailDto,
  AdminReportPageDto,
} from './dto/admin-report-view.dto.js';
import { AdminReportsQueryDto } from './dto/admin-reports-query.dto.js';
import { ResolveReportDto } from './dto/resolve-report.dto.js';

@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin/reports')
@Roles('ADMIN')
@UseGuards(RolesGuard)
@ApiForbiddenResponse({
  description:
    'No es admin (FORBIDDEN), o intenta sancionarse a sí mismo (CANNOT_ACT_ON_SELF) o a otro admin (CANNOT_SANCTION_ADMIN)',
})
export class AdminReportsController {
  constructor(
    private readonly reads: AdminReportsReadService,
    private readonly resolver: AdminReportResolveService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Cola de reportes con filtros (solo admin)' })
  @ApiOkResponse({ type: AdminReportPageDto })
  list(@Query() query: AdminReportsQueryDto): Promise<AdminReportPageDto> {
    return this.reads.list(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de un reporte y sus pendientes hermanos' })
  @ApiOkResponse({ type: AdminReportDetailDto })
  @ApiNotFoundResponse({ description: 'REPORT_NOT_FOUND' })
  detail(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AdminReportDetailDto> {
    return this.reads.detail(id);
  }

  @Post(':id/resolve')
  @HttpCode(204)
  @ApiOperation({ summary: 'Desestimar el reporte o sancionar al objetivo' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ description: 'REPORT_NOT_FOUND' })
  @ApiConflictResponse({ description: 'REPORT_ALREADY_RESOLVED' })
  resolve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResolveReportDto,
    @Actor() actor: ActorContext,
  ): Promise<void> {
    return this.resolver.resolve(id, dto, actor);
  }
}
