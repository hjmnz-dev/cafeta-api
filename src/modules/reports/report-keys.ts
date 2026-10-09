import type { ReportTarget } from '../../generated/prisma/client.js';

// La llave que impide dos reportes pendientes del mismo reportante sobre el
// mismo objetivo (spec 0002): `USER:<id>` o `POST:<id>`. La base solo asegura
// que exista mientras el reporte está pendiente; que su texto corresponda al
// objetivo lo asegura esta función.
export function pendingKeyOf(type: ReportTarget, targetId: string): string {
  return `${type}:${targetId}`;
}
