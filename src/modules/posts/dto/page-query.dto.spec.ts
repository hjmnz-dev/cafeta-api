// class-transformer lee los tipos con reflect-metadata; en la app lo carga Nest.
import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { FeedQueryDto } from './feed-query.dto.js';

// Consulta de las listas (spec 0005, AC-5 y AC-6), con las mismas opciones que
// el ValidationPipe global. La query llega como texto, igual que en HTTP.
async function check(query: Record<string, string>) {
  const dto = plainToInstance(FeedQueryDto, query);
  const errors = await validate(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return { dto, invalid: errors.map((e) => e.property) };
}

const UUID = '01926f00-0000-7000-8000-000000000065';

describe('FeedQueryDto', () => {
  it('AC-5: sin limit usa 20', async () => {
    const { dto, invalid } = await check({});
    expect(invalid).toEqual([]);
    expect(dto.limit).toBe(20);
  });

  it('AC-5: convierte limit de texto a número y acepta de 1 a 50', async () => {
    for (const limit of ['1', '50']) {
      const { dto, invalid } = await check({ limit });
      expect(invalid).toEqual([]);
      expect(dto.limit).toBe(Number(limit));
    }
  });

  it('AC-5: rechaza limit fuera de 1 a 50 o que no sea entero', async () => {
    for (const limit of ['0', '51', '2.5', 'veinte']) {
      expect((await check({ limit })).invalid).toEqual(['limit']);
    }
  });

  it('cursor y careerId deben ser uuid', async () => {
    expect((await check({ cursor: UUID, careerId: UUID })).invalid).toEqual([]);
    expect((await check({ cursor: 'p20' })).invalid).toEqual(['cursor']);
    expect((await check({ careerId: 'medicina' })).invalid).toEqual([
      'careerId',
    ]);
  });

  it('un parámetro que no existe se rechaza', async () => {
    expect((await check({ sort: 'asc' })).invalid).toEqual(['sort']);
  });
});
