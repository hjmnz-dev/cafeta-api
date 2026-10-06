import { Injectable } from '@nestjs/common';
import * as Sentry from '@sentry/node';
import { ReportThrottle, throttleKey } from './report-throttle.js';

export interface ReportContext {
  userId?: string;
  method: string;
  route: string;
  code: string;
}

/**
 * Único punto de la API que habla con Sentry (spec 0007). El contexto viaja en
 * cada captura, nunca en el scope global: sin --import las peticiones no están
 * aisladas y un setUser global mezclaría usuarios.
 */
@Injectable()
export class ErrorReporter {
  constructor(private readonly throttle: ReportThrottle) {}

  report(exception: unknown, context: ReportContext): void {
    if (!Sentry.getClient()) return;
    if (!this.throttle.allow(throttleKey(exception), Date.now())) return;
    Sentry.captureException(exception, {
      user: context.userId ? { id: context.userId } : undefined,
      tags: {
        'http.method': context.method,
        'http.route': context.route,
        'error.code': context.code,
      },
    });
  }
}
