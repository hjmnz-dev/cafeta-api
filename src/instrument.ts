import { join } from 'node:path';
import * as Sentry from '@sentry/node';
import { sentryOptions } from './common/monitoring/sentry-options.js';
import { readAppVersion } from './health/app-version.js';

// version.txt queda junto a dist/: desde dist/ (o src/) es una carpeta arriba.
export const VERSION_FILE = join(import.meta.dirname, '..', 'version.txt');

// Corre antes que ConfigModule, por eso lee process.env directo. Sin DSN (o
// vacío) no se inicia nada y todo el monitoreo es una operación vacía.
const dsn = process.env.SENTRY_DSN?.trim();
if (dsn) {
  Sentry.init(sentryOptions(dsn, readAppVersion(VERSION_FILE)));
}

/** Envía un fallo de arranque y espera hasta 2 segundos antes de salir (AC-5). */
export async function captureStartupError(error: unknown): Promise<void> {
  if (!Sentry.getClient()) return;
  Sentry.captureException(error);
  await Sentry.flush(2000);
}
