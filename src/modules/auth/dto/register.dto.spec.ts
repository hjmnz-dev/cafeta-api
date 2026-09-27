import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RegisterDto } from './register.dto.js';

// Límites exactos del registro (spec 0004, AC-4), con las mismas opciones que
// el ValidationPipe global de app.setup.ts.
const valid = {
  email: 'cgomez@est.intec.edu.do',
  password: 'clave-segura-2026',
  firstName: 'Carlos',
  lastName: 'Gómez',
  handle: 'cgomez_intec',
  careerId: '01926f00-0000-7000-8000-0000000000c1',
  acceptTerms: true,
};

async function check(overrides: Record<string, unknown>) {
  const dto = plainToInstance(RegisterDto, { ...valid, ...overrides });
  const errors = await validate(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return { dto, invalid: errors.map((e) => e.property) };
}

describe('RegisterDto', () => {
  it('acepta un registro completo', async () => {
    expect((await check({})).invalid).toEqual([]);
  });

  it('AC-1: normaliza el correo y el handle a minúsculas sin espacios', async () => {
    const { dto, invalid } = await check({
      email: '  CGomez@EST.intec.edu.do ',
      handle: ' CGomez_Intec ',
      firstName: '  Carlos ',
    });
    expect(invalid).toEqual([]);
    expect(dto.email).toBe('cgomez@est.intec.edu.do');
    expect(dto.handle).toBe('cgomez_intec');
    expect(dto.firstName).toBe('Carlos');
  });

  it.each([
    ['8 caracteres con letra y número', 'abcdefg1'],
    ['72 caracteres', `${'a'.repeat(71)}1`],
  ])('AC-4: acepta una contraseña de %s', async (_caso, password) => {
    expect((await check({ password })).invalid).toEqual([]);
  });

  it.each([
    ['7 caracteres', 'abcdef1'],
    ['73 caracteres', `${'a'.repeat(72)}1`],
    ['solo letras', 'sololetras'],
    ['solo números', '12345678'],
  ])('AC-4: rechaza una contraseña de %s', async (_caso, password) => {
    expect((await check({ password })).invalid).toEqual(['password']);
  });

  it.each([
    ['3 caracteres', 'abc'],
    ['30 caracteres', 'a'.repeat(30)],
    ['punto y guion bajo', 'c.gomez_1'],
  ])('AC-4: acepta un handle de %s', async (_caso, handle) => {
    expect((await check({ handle })).invalid).toEqual([]);
  });

  it.each([
    ['2 caracteres', 'ab'],
    ['31 caracteres', 'a'.repeat(31)],
    ['un guion', 'c-gomez'],
    ['un espacio en medio', 'c gomez'],
    ['una tilde', 'gómez'],
  ])('AC-4: rechaza un handle de %s', async (_caso, handle) => {
    expect((await check({ handle })).invalid).toEqual(['handle']);
  });

  it.each([false, 'true', undefined])(
    'AC-4: sin acceptTerms igual a true (%s) el registro no es válido',
    async (acceptTerms) => {
      expect((await check({ acceptTerms })).invalid).toEqual(['acceptTerms']);
    },
  );

  it('respeta los largos de nombre (30) y apellido (29)', async () => {
    expect(
      (await check({ firstName: 'a'.repeat(30), lastName: 'b'.repeat(29) }))
        .invalid,
    ).toEqual([]);
    expect(
      (await check({ firstName: 'a'.repeat(31), lastName: 'b'.repeat(30) }))
        .invalid,
    ).toEqual(['firstName', 'lastName']);
  });

  it('un nombre de solo espacios queda vacío y no es válido', async () => {
    expect((await check({ firstName: '   ' })).invalid).toEqual(['firstName']);
  });

  it('una carrera que no es UUID no es válida', async () => {
    expect((await check({ careerId: 'software' })).invalid).toEqual([
      'careerId',
    ]);
  });

  it('rechaza campos que no son del contrato, como role', async () => {
    expect((await check({ role: 'ADMIN' })).invalid).toEqual(['role']);
  });
});
