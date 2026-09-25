import {
  ArgumentsHost,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { HttpExceptionFilter } from './http-exception.filter.js';

function hostWithResponse() {
  const res = { status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  const host = {
    switchToHttp: () => ({ getResponse: () => res }),
  } as unknown as ArgumentsHost;
  return { host, res };
}

describe('HttpExceptionFilter', () => {
  const filter = new HttpExceptionFilter();

  it('usa el code propio de la excepción', () => {
    const { host, res } = hostWithResponse();
    filter.catch(
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

  it('usa el nombre del estado HTTP cuando no hay code propio', () => {
    const { host, res } = hostWithResponse();
    filter.catch(new NotFoundException('No existe'), host);
    expect(res.json).toHaveBeenCalledWith({
      statusCode: 404,
      message: 'No existe',
      code: 'NOT_FOUND',
    });
  });

  it('oculta el detalle de un error inesperado', () => {
    const { host, res } = hostWithResponse();
    filter.catch(new Error('secreto interno'), host);
    expect(res.json).toHaveBeenCalledWith({
      statusCode: 500,
      message: 'Error interno del servidor',
      code: 'INTERNAL_SERVER_ERROR',
    });
  });
});
