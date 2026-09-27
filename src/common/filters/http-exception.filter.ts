import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { actorFromRequest } from '../actor/actor.decorator.js';
import type { AuthenticatedUser } from '../actor/actor-context.js';
import { AuditService } from '../audit/audit.service.js';

export interface ErrorBody {
  statusCode: number;
  message: string | string[];
  code: string;
}

// Toda respuesta de error sale con la forma { statusCode, message, code }.
// Para dar un code propio: throw new ConflictException({ message, code: 'EMAIL_TAKEN' }).
// Sin code propio, se usa el nombre del estado HTTP (NOT_FOUND, BAD_REQUEST...).
// Cada 403 queda en la bitácora como access.denied antes de responder (spec 0003).
@Injectable()
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  constructor(private readonly audit: AuditService) {}

  async catch(exception: unknown, host: ArgumentsHost): Promise<void> {
    const http = host.switchToHttp();
    const res = http.getResponse<Response>();
    const body = this.toBody(exception);
    if (body.statusCode === HttpStatus.FORBIDDEN) {
      await this.auditDenied(
        http.getRequest<Request & { user?: AuthenticatedUser }>(),
        body,
      );
    }
    res.status(body.statusCode).json(body);
  }

  private async auditDenied(
    req: Request & { user?: AuthenticatedUser },
    body: ErrorBody,
  ): Promise<void> {
    await this.audit.recordStandalone({
      action: 'access.denied',
      entityType: 'route',
      actor: actorFromRequest(req),
      succeeded: false,
      metadata: {
        method: req.method,
        route: req.originalUrl.split('?')[0],
        code: body.code,
      },
    });
  }

  private toBody(exception: unknown): ErrorBody {
    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      const response = exception.getResponse();
      const fallbackCode = HttpStatus[statusCode] ?? 'ERROR';
      if (typeof response === 'object' && response !== null) {
        const r = response as { message?: string | string[]; code?: string };
        return {
          statusCode,
          message: r.message ?? exception.message,
          code: r.code ?? fallbackCode,
        };
      }
      return { statusCode, message: String(response), code: fallbackCode };
    }

    // Error inesperado: se registra completo, pero al cliente no se le filtra nada.
    this.logger.error(
      exception instanceof Error ? exception.stack : String(exception),
    );
    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Error interno del servidor',
      code: 'INTERNAL_SERVER_ERROR',
    };
  }
}
