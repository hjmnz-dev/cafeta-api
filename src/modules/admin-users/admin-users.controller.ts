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
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Actor } from '../../common/actor/actor.decorator.js';
import type { ActorContext } from '../../common/actor/actor-context.js';
import { AdminReasonDto } from '../../common/audit/admin-reason.dto.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { AdminUserActionsService } from './admin-user-actions.service.js';
import { AdminUserVerificationService } from './admin-user-verification.service.js';
import { AdminUsersReadService } from './admin-users-read.service.js';
import { AdminUserPageDto } from './dto/admin-user-view.dto.js';
import { AdminUsersQueryDto } from './dto/admin-users-query.dto.js';
import { VerificationDecisionDto } from './dto/verification-decision.dto.js';

@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin/users')
@Roles('ADMIN')
@UseGuards(RolesGuard)
@ApiForbiddenResponse({
  description:
    'No es admin (FORBIDDEN), o intenta actuar sobre sí mismo (CANNOT_ACT_ON_SELF) o sancionar a otro admin (CANNOT_SANCTION_ADMIN)',
})
export class AdminUsersController {
  constructor(
    private readonly reads: AdminUsersReadService,
    private readonly actions: AdminUserActionsService,
    private readonly verification: AdminUserVerificationService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Lista de usuarios con filtros (solo admin)' })
  @ApiOkResponse({ type: AdminUserPageDto })
  list(@Query() query: AdminUsersQueryDto): Promise<AdminUserPageDto> {
    return this.reads.list(query);
  }

  @Post(':id/deactivate')
  @HttpCode(204)
  @ApiOperation({ summary: 'Desactivar una cuenta y cerrar sus sesiones' })
  @ApiNoContentResponse()
  @ApiConflictResponse({
    description: 'Ya estaba desactivada: ALREADY_INACTIVE',
  })
  deactivate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdminReasonDto,
    @Actor() actor: ActorContext,
  ): Promise<void> {
    return this.actions.deactivate(id, dto.reason, actor);
  }

  @Post(':id/reactivate')
  @HttpCode(204)
  @ApiOperation({ summary: 'Reactivar una cuenta con su historial' })
  @ApiNoContentResponse()
  @ApiConflictResponse({ description: 'Ya estaba activa: ALREADY_ACTIVE' })
  reactivate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdminReasonDto,
    @Actor() actor: ActorContext,
  ): Promise<void> {
    return this.actions.reactivate(id, dto.reason, actor);
  }

  @Post(':id/verification')
  @HttpCode(204)
  @ApiOperation({ summary: 'Verificar o rechazar una cuenta pendiente' })
  @ApiNoContentResponse()
  @ApiConflictResponse({
    description: 'Ya tenía decisión: VERIFICATION_ALREADY_DECIDED',
  })
  decide(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VerificationDecisionDto,
    @Actor() actor: ActorContext,
  ): Promise<void> {
    return this.verification.decide(id, dto.decision, actor);
  }
}
