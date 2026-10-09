import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { AdminAuditReadService } from './admin-audit-read.service.js';
import { AdminAuditQueryDto } from './dto/admin-audit-query.dto.js';
import {
  AdminAuditPageDto,
  AuditActionsDto,
} from './dto/admin-audit-view.dto.js';

@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin/audit-logs')
@Roles('ADMIN')
@UseGuards(RolesGuard)
@ApiForbiddenResponse({ description: 'No es admin: FORBIDDEN' })
export class AdminAuditController {
  constructor(private readonly reads: AdminAuditReadService) {}

  @Get()
  @ApiOperation({ summary: 'Bitácora de auditoría con filtros (solo admin)' })
  @ApiOkResponse({ type: AdminAuditPageDto })
  @ApiBadRequestResponse({
    description:
      'Filtro inválido (VALIDATION_ERROR), rango de fechas inválido (INVALID_DATE_RANGE) o cursor ajeno (INVALID_CURSOR)',
  })
  list(@Query() query: AdminAuditQueryDto): Promise<AdminAuditPageDto> {
    return this.reads.list(query);
  }

  @Get('actions')
  @ApiOperation({ summary: 'Catálogo de acciones auditables (solo admin)' })
  @ApiOkResponse({ type: AuditActionsDto })
  actions(): AuditActionsDto {
    return this.reads.actions();
  }
}
