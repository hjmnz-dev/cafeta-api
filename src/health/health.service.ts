import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { HealthDto } from './dto/health.dto.js';

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(private readonly prisma: PrismaService) {}

  async check(): Promise<HealthDto> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok', db: 'up' };
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
