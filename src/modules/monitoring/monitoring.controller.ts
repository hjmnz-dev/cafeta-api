import { Controller, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiInternalServerErrorResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Actor } from '../../common/actor/actor.decorator.js';
import type { ActorContext } from '../../common/actor/actor-context.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { Role } from '../../generated/prisma/client.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { MonitoringService } from './monitoring.service.js';

@ApiTags('monitoring')
@ApiBearerAuth()
@Controller('monitoring')
export class MonitoringController {
  constructor(private readonly monitoring: MonitoringService) {}

  @Post('test-error')
  @Roles(Role.ADMIN)
  @UseGuards(RolesGuard)
  @ApiOperation({
    summary: 'Fuerza un error para comprobar el monitoreo (solo admin)',
  })
  @ApiInternalServerErrorResponse({
    description: 'Siempre: { statusCode: 500, code: INTERNAL_SERVER_ERROR }',
  })
  @ApiUnauthorizedResponse({ description: 'Sin sesión' })
  @ApiForbiddenResponse({ description: 'La cuenta no es admin' })
  forceTestError(@Actor() actor: ActorContext): Promise<never> {
    return this.monitoring.forceTestError(actor);
  }
}
