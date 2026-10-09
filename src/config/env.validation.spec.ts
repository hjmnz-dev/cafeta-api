// class-transformer lee los tipos con reflect-metadata; en la app lo carga Nest.
import 'reflect-metadata';
import { validateEnv } from './env.validation.js';

// POST_RATE_LIMIT (spec 0005, "Configuración requerida"): entero, 10 por defecto.
const base = {
  DATABASE_URL: 'postgresql://cafeta:cafeta@localhost:5432/cafeta',
  DIRECT_URL: 'postgresql://cafeta:cafeta@localhost:5432/cafeta',
  JWT_SECRET: 'secreto-de-prueba-con-mas-de-32-caracteres',
  WEB_ORIGIN: 'http://localhost:5173',
  ADMIN_ORIGIN: 'http://localhost:5174',
};

// COMMENT_RATE_LIMIT (spec 0009, decisión 21): entero, 20 por defecto.
describe('validateEnv · COMMENT_RATE_LIMIT', () => {
  it('sin la variable usa 20 comentarios por minuto', () => {
    expect(validateEnv(base).COMMENT_RATE_LIMIT).toBe(20);
  });

  it('lee el valor del entorno como número', () => {
    expect(
      validateEnv({ ...base, COMMENT_RATE_LIMIT: '1000' }).COMMENT_RATE_LIMIT,
    ).toBe(1000);
  });

  it('no arranca con un límite de 0 o que no sea entero', () => {
    for (const value of ['0', '2.5', 'veinte']) {
      expect(() => validateEnv({ ...base, COMMENT_RATE_LIMIT: value })).toThrow(
        /COMMENT_RATE_LIMIT/,
      );
    }
  });

  it('no cambia los otros límites', () => {
    const env = validateEnv({ ...base, COMMENT_RATE_LIMIT: '3' });
    expect(env.POST_RATE_LIMIT).toBe(10);
    expect(env.AUTH_RATE_LIMIT).toBe(5);
  });
});

describe('validateEnv · POST_RATE_LIMIT', () => {
  it('sin la variable usa 10 publicaciones por minuto', () => {
    expect(validateEnv(base).POST_RATE_LIMIT).toBe(10);
  });

  it('lee el valor del entorno como número', () => {
    expect(
      validateEnv({ ...base, POST_RATE_LIMIT: '1000' }).POST_RATE_LIMIT,
    ).toBe(1000);
  });

  it('no arranca con un límite de 0 o que no sea entero', () => {
    for (const value of ['0', '2.5', 'diez']) {
      expect(() => validateEnv({ ...base, POST_RATE_LIMIT: value })).toThrow(
        /POST_RATE_LIMIT/,
      );
    }
  });

  it('el límite de publicaciones no reemplaza al de auth', () => {
    const env = validateEnv({ ...base, POST_RATE_LIMIT: '3' });
    expect(env.AUTH_RATE_LIMIT).toBe(5);
  });
});
