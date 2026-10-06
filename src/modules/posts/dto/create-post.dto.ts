import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  ValidateBy,
} from 'class-validator';
import { MEDIA_KEY_PATTERN } from '../../uploads/media-formats.js';
import { CAMPUS_LOCATIONS, type CampusLocation } from '../campus-locations.js';

export const POST_CONTENT_MAX = 2000;
export const POST_MEDIA_MAX = 4;

// Cuenta en puntos de código, igual que varchar(2000) en PostgreSQL. MaxLength
// descuenta los selectores de variación de los emojis y dejaría pasar un texto
// que la base rechaza con un 500 (spec 0005).
export function codePoints(text: string): number {
  return [...text].length;
}

const MaxCodePoints = (max: number) =>
  ValidateBy({
    name: 'maxCodePoints',
    constraints: [max],
    validator: {
      // Solo mide textos: si no es texto, el error es de @IsString y no de largo.
      validate: (value: unknown) =>
        typeof value !== 'string' || codePoints(value.trim()) <= max,
      defaultMessage: () => `content debe tener como máximo ${max} caracteres`,
    },
  });

export class CreatePostDto {
  /** Texto de la publicación, de 1 a 2000 caracteres sin contar los espacios de los bordes. */
  @IsString()
  @MaxCodePoints(POST_CONTENT_MAX)
  content: string;

  @ApiProperty({ enum: CAMPUS_LOCATIONS, required: false })
  @IsOptional()
  @IsIn(CAMPUS_LOCATIONS)
  location?: CampusLocation;

  /** Claves que devolvió POST /uploads: hasta 4 imágenes, o 1 video, o 1 PDF. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(POST_MEDIA_MAX)
  @ArrayUnique()
  @Matches(MEDIA_KEY_PATTERN, {
    each: true,
    message: 'mediaKeys trae una clave inválida',
  })
  mediaKeys?: string[];
}
