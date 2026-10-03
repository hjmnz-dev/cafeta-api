import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Token del commit desplegado que muestra `/health` (spec 0006, enmienda 2). */
export const APP_VERSION = Symbol('APP_VERSION');

// El job `deploy` deja version.txt en la raíz del paquete, junto a dist/. Desde
// dist/health/ (o src/health/ en las pruebas) son dos carpetas hacia arriba; no se
// usa el directorio de trabajo porque depende de cómo se lance el proceso.
const VERSION_FILE = join(import.meta.dirname, '..', '..', 'version.txt');

/** Lee el commit desplegado; sin el archivo (local, pruebas) responde `dev`. */
export function readAppVersion(file: string = VERSION_FILE): string {
  try {
    return readFileSync(file, 'utf8').trim() || 'dev';
  } catch {
    return 'dev';
  }
}
