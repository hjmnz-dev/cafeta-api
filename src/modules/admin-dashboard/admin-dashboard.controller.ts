import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { AdminDashboardService } from './admin-dashboard.service.js';
import { DashboardMetricsDto } from './dto/dashboard-metrics.dto.js';

@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin/dashboard')
@Roles('ADMIN')
@UseGuards(RolesGuard)
export class AdminDashboardController {
  constructor(private readonly dashboard: AdminDashboardService) {}

  @Get()
  @ApiOperation({ summary: 'Métricas generales de la plataforma (solo admin)' })
  @ApiOkResponse({ type: DashboardMetricsDto })
  @ApiUnauthorizedResponse({ description: 'Sin sesión' })
  @ApiForbiddenResponse({ description: 'La cuenta no es admin: FORBIDDEN' })
  metrics(): Promise<DashboardMetricsDto> {
    return this.dashboard.metrics();
  }
}
