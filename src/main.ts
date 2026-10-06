// Debe quedar como primera línea: Sentry tiene que iniciar antes que el resto
// de la app para capturar sus errores (spec 0007). No se usa --import: sin
// trazas no hace falta, y el startup de App Service sigue igual.
import { captureStartupError } from './instrument.js';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';
import type { EnvironmentVariables } from './config/env.validation.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  configureApp(app);
  const config =
    app.get<ConfigService<EnvironmentVariables, true>>(ConfigService);
  await app.listen(config.get('PORT', { infer: true }));
}

try {
  await bootstrap();
} catch (error) {
  await captureStartupError(error);
  throw error;
}
