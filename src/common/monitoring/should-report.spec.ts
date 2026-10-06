import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpStatus,
  InternalServerErrorException,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
  UnprocessableEntityException,
  HttpException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import type { ErrorBody } from '../filters/http-exception.filter.js';
import { shouldReport } from './should-report.js';

const body = (
  statusCode: number,
  code = HttpStatus[statusCode],
): ErrorBody => ({
  statusCode,
  message: 'x',
  code: code ?? 'ERROR',
});

describe('shouldReport', () => {
  it('reporta un error inesperado', () => {
    expect(
      shouldReport(new Error('x'), body(500, 'INTERNAL_SERVER_ERROR')),
    ).toBe(true);
  });

  it('reporta InternalServerErrorException y un 502', () => {
    expect(shouldReport(new InternalServerErrorException(), body(500))).toBe(
      true,
    );
    expect(shouldReport(new BadGatewayException(), body(502))).toBe(true);
  });

  it.each([
    [new BadRequestException(), 400],
    [new UnauthorizedException(), 401],
    [new ForbiddenException(), 403],
    [new NotFoundException(), 404],
    [new ConflictException(), 409],
    [new UnprocessableEntityException(), 422],
    [new HttpException('x', 429), 429],
  ])('no reporta un %s', (exception, status) => {
    expect(shouldReport(exception, body(status))).toBe(false);
  });

  it('no reporta el 503 DATABASE_UNAVAILABLE', () => {
    expect(
      shouldReport(
        new ServiceUnavailableException(),
        body(503, 'DATABASE_UNAVAILABLE'),
      ),
    ).toBe(false);
  });

  it('no reporta una base caída', () => {
    const init = new Prisma.PrismaClientInitializationError('x', '7.0.0');
    const p1001 = new Prisma.PrismaClientKnownRequestError('x', {
      code: 'P1001',
      clientVersion: '7.0.0',
    });
    expect(shouldReport(init, body(500))).toBe(false);
    expect(shouldReport(p1001, body(500))).toBe(false);
  });

  it('reporta otro error conocido de Prisma', () => {
    const p2002 = new Prisma.PrismaClientKnownRequestError('x', {
      code: 'P2002',
      clientVersion: '7.0.0',
    });
    expect(shouldReport(p2002, body(500))).toBe(true);
  });

  it('no reporta un error plano con status 4xx', () => {
    const tooLarge = Object.assign(new Error('request entity too large'), {
      status: 413,
    });
    expect(shouldReport(tooLarge, body(500))).toBe(false);
  });
});
