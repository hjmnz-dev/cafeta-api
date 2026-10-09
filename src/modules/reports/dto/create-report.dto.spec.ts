import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateReportDto } from './create-report.dto.js';

const UUID = '0192f6a0-7b1e-7c3a-9d2f-0123456789ab';

const check = async (body: Record<string, unknown>) => {
  const dto = plainToInstance(CreateReportDto, body);
  const errors = await validate(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return { dto, errors };
};

describe('CreateReportDto', () => {
  it('acepta un reporte completo', async () => {
    const { errors } = await check({
      targetType: 'POST',
      targetId: UUID,
      reason: 'HARASSMENT',
      details: 'Me insulta en los comentarios',
    });
    expect(errors).toHaveLength(0);
  });

  it('el detalle es opcional', async () => {
    const { errors } = await check({
      targetType: 'USER',
      targetId: UUID,
      reason: 'SPAM',
    });
    expect(errors).toHaveLength(0);
  });

  it('un detalle de puros espacios cuenta como ausente', async () => {
    const { dto, errors } = await check({
      targetType: 'USER',
      targetId: UUID,
      reason: 'OTHER',
      details: '   ',
    });
    expect(errors).toHaveLength(0);
    expect(dto.details).toBeUndefined();
  });

  it('recorta los espacios del detalle', async () => {
    const { dto } = await check({
      targetType: 'USER',
      targetId: UUID,
      reason: 'OTHER',
      details: '  texto  ',
    });
    expect(dto.details).toBe('texto');
  });

  it('rechaza un detalle de más de 500 caracteres', async () => {
    const { errors } = await check({
      targetType: 'USER',
      targetId: UUID,
      reason: 'OTHER',
      details: 'a'.repeat(501),
    });
    expect(errors.map((e) => e.property)).toContain('details');
  });

  it('acepta un detalle de exactamente 500 caracteres', async () => {
    const { errors } = await check({
      targetType: 'USER',
      targetId: UUID,
      reason: 'OTHER',
      details: 'a'.repeat(500),
    });
    expect(errors).toHaveLength(0);
  });

  it('rechaza un motivo, un tipo o un id inválidos', async () => {
    const { errors } = await check({
      targetType: 'STORY',
      targetId: 'no-es-uuid',
      reason: 'ODIO',
    });
    expect(errors.map((e) => e.property).sort()).toEqual([
      'reason',
      'targetId',
      'targetType',
    ]);
  });

  it('rechaza campos que no existen, como reporterId', async () => {
    const { errors } = await check({
      targetType: 'USER',
      targetId: UUID,
      reason: 'SPAM',
      reporterId: UUID,
    });
    expect(errors.map((e) => e.property)).toContain('reporterId');
  });
});
