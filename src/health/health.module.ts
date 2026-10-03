import { Module } from '@nestjs/common';
import { APP_VERSION, readAppVersion } from './app-version.js';
import { HealthController } from './health.controller.js';
import { HealthService } from './health.service.js';

@Module({
  controllers: [HealthController],
  providers: [
    HealthService,
    // Se lee una vez al arrancar: el commit no cambia mientras corre el proceso.
    { provide: APP_VERSION, useFactory: () => readAppVersion() },
  ],
})
export class HealthModule {}
