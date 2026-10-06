import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import type { EnvironmentVariables } from './config/env.validation.js';
import { SocketIoAdapter } from './modules/realtime/socket-io.adapter.js';

// Configuración HTTP común. La usan main.ts y las pruebas e2e,
// así las pruebas ven la API igual que en producción.
export function configureApp(app: NestExpressApplication): void {
  const config =
    app.get<ConfigService<EnvironmentVariables, true>>(ConfigService);

  // Detrás del proxy de Azure, sin esto todos comparten la misma IP.
  app.set('trust proxy', 1);
  app.use(helmet());
  const origins = [
    config.get('WEB_ORIGIN', { infer: true }),
    config.get('ADMIN_ORIGIN', { infer: true }),
  ];
  app.enableCors({
    origin: origins,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
    allowedHeaders: ['Authorization', 'Content-Type'],
  });

  // El socket vive en /socket.io, fuera del prefijo (spec 0008, decisión 25).
  app.useWebSocketAdapter(new SocketIoAdapter(app, origins));

  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      // Todo error de validación sale con un code estable (spec 0003).
      exceptionFactory: (errors) =>
        new BadRequestException({
          message: errors.flatMap((e) => Object.values(e.constraints ?? {})),
          code: 'VALIDATION_ERROR',
        }),
    }),
  );
  // El filtro de errores se registra como APP_FILTER en AppModule (usa AuditService).

  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('Cafeta API')
      .setDescription('API de la red social universitaria Cafeta')
      .setVersion('1')
      .addBearerAuth()
      .build(),
  );
  SwaggerModule.setup('api/docs', app, document, {
    jsonDocumentUrl: 'api/docs-json',
  });
}
