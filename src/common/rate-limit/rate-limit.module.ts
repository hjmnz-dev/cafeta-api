import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import type { EnvironmentVariables } from '../../config/env.validation.js';

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

// Límites de peticiones con nombre (spec 0005). Cada ruta los activa con su
// guard y apaga el que no le toca con @SkipThrottle:
// - auth: registro y login, por IP (ThrottlerGuard).
// - posts: publicar, por usuario (UserThrottlerGuard).
// - comments: crear y editar comentarios, por usuario (UserThrottlerGuard).
// - reset: pedir el enlace de recuperar contraseña, por IP y por hora (spec 0008).
// ThrottlerModule es global, así que los guards funcionan en cualquier módulo.
@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvironmentVariables, true>) => [
        {
          name: 'auth',
          ttl: MINUTE_MS,
          limit: config.get('AUTH_RATE_LIMIT', { infer: true }),
        },
        {
          name: 'posts',
          ttl: MINUTE_MS,
          limit: config.get('POST_RATE_LIMIT', { infer: true }),
        },
        {
          name: 'comments',
          ttl: MINUTE_MS,
          limit: config.get('COMMENT_RATE_LIMIT', { infer: true }),
        },
        {
          name: 'reset',
          ttl: HOUR_MS,
          limit: config.get('PASSWORD_RESET_RATE_LIMIT', { infer: true }),
        },
      ],
    }),
  ],
})
export class RateLimitModule {}
