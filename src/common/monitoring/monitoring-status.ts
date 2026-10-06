import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  NodeEnv,
  type EnvironmentVariables,
} from '../../config/env.validation.js';

/** Avisa una vez al arrancar si producción quedó sin monitoreo (AC-6). */
@Injectable()
export class MonitoringStatus implements OnApplicationBootstrap {
  private readonly logger = new Logger('Monitoreo');

  constructor(
    private readonly config: ConfigService<EnvironmentVariables, true>,
  ) {}

  onApplicationBootstrap(): void {
    const production =
      this.config.get('NODE_ENV', { infer: true }) === NodeEnv.Production;
    const dsn = this.config.get('SENTRY_DSN', { infer: true });
    if (production && !dsn) {
      this.logger.warn('Monitoreo de errores apagado: falta SENTRY_DSN');
    }
  }
}
