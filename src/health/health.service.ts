import {
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { APP_VERSION } from './app-version.js';
import { HealthDto } from './dto/health.dto.js';

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(APP_VERSION) private readonly version: string,
  ) {}

  async check(): Promise<HealthDto> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok', db: 'up', version: this.version };
    } catch (error) {
      this.logger.warn(
        `La base de datos no responde: ${(error as Error).message}`,
      );
      throw new ServiceUnavailableException({
        message: 'La base de datos no responde',
        code: 'DATABASE_UNAVAILABLE',
      });
    }
  }
}
