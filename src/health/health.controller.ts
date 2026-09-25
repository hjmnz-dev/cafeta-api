import { Controller, Get } from '@nestjs/common';
import { ApiServiceUnavailableResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator.js';
import { HealthService } from './health.service.js';
import { HealthDto } from './dto/health.dto.js';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Public()
  @Get()
  @ApiServiceUnavailableResponse({
    description: 'La base de datos no responde (DATABASE_UNAVAILABLE)',
  })
  check(): Promise<HealthDto> {
    return this.health.check();
  }
}
