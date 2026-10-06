import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
  PayloadTooLargeException,
} from '@nestjs/common';
import { catchError, type Observable, throwError } from 'rxjs';
import { ALLOWED_FORMATS_TEXT } from './media-formats.js';

// multer corta a los 25 MB con un "File too large" sin code; aquí sale con
// FILE_TOO_LARGE, igual que los límites por tipo de UploadsService.
@Injectable()
export class MulterErrorsInterceptor implements NestInterceptor {
  intercept(
    _context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    return next.handle().pipe(
      catchError((error: unknown) =>
        throwError(() =>
          error instanceof PayloadTooLargeException
            ? new PayloadTooLargeException({
                message: `El archivo pasa del límite. Se aceptan ${ALLOWED_FORMATS_TEXT}`,
                code: 'FILE_TOO_LARGE',
              })
            : error,
        ),
      ),
    );
  }
}
