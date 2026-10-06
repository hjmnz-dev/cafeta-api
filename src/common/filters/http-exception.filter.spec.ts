import {
  ArgumentsHost,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { AuditService } from '../audit/audit.service.js';
import type { ErrorReporter } from '../monitoring/error-reporter.js';
import { HttpExceptionFilter } from './http-exception.filter.js';

function hostWithResponse(extra: Record<string, unknown> = {}) {
  const res = { status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  const req = {
    ...extra,
    method: 'POST',
    originalUrl: '/api/v1/admin/usuarios/1/deactivate?x=1',
    ip: '10.0.0.7',
    headers: { 'user-agent': 'vitest' },
  };
  const host = {
    switchToHttp: () => ({ getResponse: () => res, getRequest: () => req }),
  } as unknown as ArgumentsHost;
  return { host, res };
}

function auditDouble() {
  const recordStandalone = vi.fn().mockResolvedValue(undefined);
  return {
    audit: { recordStandalone } as unknown as AuditService,
    recordStandalone,
  };
}

function reporterDouble() {
  const report = vi.fn();
  return { reporter: { report } as unknown as ErrorReporter, report };
}

describe('HttpExceptionFilter', () => {
  it('usa el code propio de la excepción', async () => {
    const { host, res } = hostWithResponse();
    await new HttpExceptionFilter(
      auditDouble().audit,
      reporterDouble().reporter,
    ).catch(
      new ConflictException({ message: 'Ya existe', code: 'EMAIL_TAKEN' }),
      host,
    );
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      statusCode: 409,
      message: 'Ya existe',
      code: 'EMAIL_TAKEN',
    });
  });

  it('usa el nombre del estado HTTP cuando no hay code propio', async () => {
    const { host, res } = hostWithResponse();
    await new HttpExceptionFilter(
      auditDouble().audit,
      reporterDouble().reporter,
    ).catch(new NotFoundException('No existe'), host);
    expect(res.json).toHaveBeenCalledWith({
      statusCode: 404,
      message: 'No existe',
      code: 'NOT_FOUND',
    });
  });

  it('oculta el detalle de un error inesperado', async () => {
    const { host, res } = hostWithResponse();
    await new HttpExceptionFilter(
      auditDouble().audit,
      reporterDouble().reporter,
    ).catch(new Error('secreto interno'), host);
    expect(res.json).toHaveBeenCalledWith({
      statusCode: 500,
      message: 'Error interno del servidor',
      code: 'INTERNAL_SERVER_ERROR',
    });
  });

  it('audita un 403 como access.denied antes de responder', async () => {
    const { host, res } = hostWithResponse();
    const { audit, recordStandalone } = auditDouble();
    await new HttpExceptionFilter(audit, reporterDouble().reporter).catch(
      new ForbiddenException(),
      host,
    );
    expect(recordStandalone).toHaveBeenCalledWith({
      action: 'access.denied',
      entityType: 'route',
      actor: {
        userId: null,
        role: null,
        ip: '10.0.0.7',
        userAgent: 'vitest',
      },
      succeeded: false,
      metadata: {
        method: 'POST',
        route: '/api/v1/admin/usuarios/1/deactivate',
        code: 'FORBIDDEN',
      },
    });
    expect(recordStandalone.mock.invocationCallOrder[0]).toBeLessThan(
      res.status.mock.invocationCallOrder[0],
    );
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('no audita errores que no son 403', async () => {
    const { host } = hostWithResponse();
    const { audit, recordStandalone } = auditDouble();
    await new HttpExceptionFilter(audit, reporterDouble().reporter).catch(
      new NotFoundException(),
      host,
    );
    expect(recordStandalone).not.toHaveBeenCalled();
  });

  it('reporta un error inesperado con el contexto de la petición', async () => {
    const { host, res } = hostWithResponse({
      route: { path: '/api/v1/posts/:id' },
      user: { id: 'u-1', role: 'STUDENT', sessionId: 's-1' },
    });
    const { reporter, report } = reporterDouble();
    const error = new Error('fallo');
    await new HttpExceptionFilter(auditDouble().audit, reporter).catch(
      error,
      host,
    );
    expect(report).toHaveBeenCalledWith(error, {
      userId: 'u-1',
      method: 'POST',
      route: '/api/v1/posts/:id',
      code: 'INTERNAL_SERVER_ERROR',
    });
    expect(res.json).toHaveBeenCalledWith({
      statusCode: 500,
      message: 'Error interno del servidor',
      code: 'INTERNAL_SERVER_ERROR',
    });
  });

  it('usa desconocida como ruta si no hay una resuelta', async () => {
    const { host } = hostWithResponse();
    const { reporter, report } = reporterDouble();
    await new HttpExceptionFilter(auditDouble().audit, reporter).catch(
      new Error('fallo'),
      host,
    );
    expect(report).toHaveBeenCalledWith(expect.any(Error), {
      userId: undefined,
      method: 'POST',
      route: 'desconocida',
      code: 'INTERNAL_SERVER_ERROR',
    });
  });

  it('no reporta un 404', async () => {
    const { host } = hostWithResponse();
    const { reporter, report } = reporterDouble();
    await new HttpExceptionFilter(auditDouble().audit, reporter).catch(
      new NotFoundException(),
      host,
    );
    expect(report).not.toHaveBeenCalled();
  });
});
