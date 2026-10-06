import {
  onUnhandledRejectionIntegration,
  type NodeOptions,
} from '@sentry/node';
import { scrubEvent } from './scrub.js';

/** Nada de usuario, cookies, headers, cuerpos, query, variables ni datos de consultas. */
export const NO_PERSONAL_DATA: NonNullable<NodeOptions['dataCollection']> = {
  userInfo: false,
  cookies: false,
  httpHeaders: false,
  httpBodies: [],
  urlQueryParams: false,
  databaseQueryData: false,
  queues: false,
  stackFrameVariables: false,
  graphQL: { document: false, variables: false },
  genAI: { inputs: false, outputs: false },
};

/**
 * Opciones de Sentry de la API (spec 0007). Sin trazas, sin breadcrumbs y sin
 * datos personales; las promesas rechazadas terminan el proceso como hoy.
 */
export function sentryOptions(dsn: string, release: string): NodeOptions {
  return {
    dsn,
    environment: 'production',
    release,
    // El spec pide sendDefaultPii: false; en el SDK 11 eso pasó a dataCollection,
    // que por defecto recolecta todo. Aquí se apaga cada categoría (AC-3).
    dataCollection: NO_PERSONAL_DATA,
    // Sin trazas no hace falta OpenTelemetry. El spec pide skipOpenTelemetrySetup,
    // que en el SDK 11 cambió a enableOpenTelemetrySetup (apagado por defecto).
    enableOpenTelemetrySetup: false,
    // Sin aislamiento por petición, los breadcrumbs se mezclarían.
    maxBreadcrumbs: 0,
    integrations: [onUnhandledRejectionIntegration({ mode: 'strict' })],
    beforeSend: scrubEvent,
  };
}
