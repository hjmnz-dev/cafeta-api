import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import { EnvironmentVariables } from '../config/env.validation.js';

// No se conecta al arrancar: la API sube aunque la base no responda,
// y solo /health reporta la caída (spec 0001).
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(config: ConfigService<EnvironmentVariables, true>) {
    super({
      adapter: new PrismaPg({
        connectionString: config.get('DATABASE_URL', { infer: true }),
        max: 5,
        connectionTimeoutMillis: 5_000,
      }),
      // El hash nunca sale en una consulta por defecto; solo auth lo pide
      // con `omit: { passwordHash: false }` (spec 0002).
      omit: { user: { passwordHash: true } },
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
