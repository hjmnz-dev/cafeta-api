import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreatePostDto } from './create-post.dto.js';

// Mensajes de validación al publicar (spec 0005, AC-2), con las mismas
// opciones que el ValidationPipe global de app.setup.ts.
async function messages(body: Record<string, unknown>): Promise<string[]> {
  const errors = await validate(plainToInstance(CreatePostDto, body), {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return errors.flatMap((e) => Object.values(e.constraints ?? {}));
}

describe('CreatePostDto', () => {
  it('sin content el DTO pasa: el service exige texto o adjuntos (HU20 E2)', async () => {
    expect(await messages({})).toEqual([]);
  });

  it('un content que no es texto tampoco se reporta como demasiado largo', async () => {
    expect(await messages({ content: 123 })).toEqual([
      'content must be a string',
    ]);
  });

  it('más de 2000 puntos de código sí se reporta como demasiado largo', async () => {
    expect(await messages({ content: 'a'.repeat(2001) })).toEqual([
      'content debe tener como máximo 2000 caracteres',
    ]);
  });

  it('cuenta los espacios de los bordes fuera del límite', async () => {
    expect(await messages({ content: `  ${'a'.repeat(2000)}  ` })).toEqual([]);
  });
});
