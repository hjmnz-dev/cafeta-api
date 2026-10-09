import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { TagCategory } from '../../../generated/prisma/enums.js';
import { MEDIA_KEY_PATTERN } from '../../uploads/media-formats.js';

export const PROFILE_TAGS_MAX = 12;

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
// Un texto vacío cuenta como "sin valor".
const trimOrNull = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() || null : value;

export class UpdateProfileTagDto {
  /** @example React */
  @Transform(trim)
  @IsString()
  @Length(1, 40)
  label: string;

  @ApiProperty({ enum: TagCategory, enumName: 'TagCategory' })
  @IsEnum(TagCategory)
  category: TagCategory;
}

// Edición parcial del perfil propio: solo cambia lo que llega. Las etiquetas
// llegan completas y reemplazan a las anteriores.
export class UpdateProfileDto {
  /** No puede quedar vacío. @example Carlos Gómez */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 60)
  displayName?: string;

  @ApiProperty({ type: String, nullable: true, required: false })
  @IsOptional()
  @Transform(trimOrNull)
  @IsString()
  @MaxLength(160)
  bio?: string | null;

  @IsOptional()
  @IsUUID()
  careerId?: string;

  @ApiProperty({ type: String, nullable: true, required: false })
  @IsOptional()
  @Transform(trimOrNull)
  @IsString()
  @MaxLength(120)
  location?: string | null;

  /** Clave que devolvió POST /uploads (una imagen). null quita la foto. */
  @ApiProperty({ type: String, nullable: true, required: false })
  @IsOptional()
  @Matches(MEDIA_KEY_PATTERN, { message: 'avatarKey trae una clave inválida' })
  avatarKey?: string | null;

  @ApiProperty({ type: [UpdateProfileTagDto], required: false })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(PROFILE_TAGS_MAX)
  @ValidateNested({ each: true })
  @Type(() => UpdateProfileTagDto)
  tags?: UpdateProfileTagDto[];
}
