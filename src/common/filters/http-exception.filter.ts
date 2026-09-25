import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';

export interface ErrorBody {
  statusCode: number;
  message: string | string[];
  code: string;
}

// Toda respuesta de error sale con la forma { statusCode, message, code }.
// Para dar un code propio: throw new ConflictException({ message, code: 'EMAIL_TAKEN' }).
// Sin code propio, se usa el nombre del estado HTTP (NOT_FOUND, BAD_REQUEST...).
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const body = this.toBody(exception);
    res.status(body.statusCode).json(body);
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
