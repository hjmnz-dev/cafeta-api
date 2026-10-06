import { IsString, ValidateBy } from 'class-validator';

export const MESSAGE_CONTENT_MAX = 2000;

// Cuenta en puntos de código, igual que varchar(2000) en PostgreSQL (misma
// regla que create-post.dto.ts): MaxLength dejaría pasar emojis que la base
// rechaza con un 500.
const MaxCodePoints = (max: number) =>
  ValidateBy({
    name: 'maxCodePoints',
    constraints: [max],
    validator: {
      validate: (value: unknown) =>
        typeof value !== 'string' || [...value.trim()].length <= max,
      defaultMessage: () => `content debe tener como máximo ${max} caracteres`,
    },
  });

export class SendMessageDto {
  /** Texto del mensaje, de 1 a 2000 caracteres sin contar los espacios de los bordes. */
  @IsString()
  @MaxCodePoints(MESSAGE_CONTENT_MAX)
  content: string;
}
