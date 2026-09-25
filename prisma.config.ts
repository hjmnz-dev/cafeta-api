// Prisma 7 no carga .env por su cuenta y su CLI corre fuera de Nest.
import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // Las migraciones usan DIRECT_URL. Se lee sin env() para que
    // `prisma generate` (postinstall, CI) no falle cuando no hay base.
    url: process.env.DIRECT_URL ?? '',
  },
});
