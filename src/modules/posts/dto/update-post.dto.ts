import { ApiProperty } from '@nestjs/swagger';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { CAMPUS_LOCATIONS, type CampusLocation } from '../campus-locations.js';
import { MaxCodePoints, POST_CONTENT_MAX } from './create-post.dto.js';

// Editar (spec 0008, decisión 17): el texto, la ubicación y los campos de su
// tipo. Los adjuntos no se tocan. Un campo ausente queda como estaba; null
// borra la ubicación.
export class UpdatePostDto {
  /** Texto nuevo, hasta 2000 caracteres. Vacío solo si la publicación tiene adjuntos. */
  @IsOptional()
  @IsString()
  @MaxCodePoints(POST_CONTENT_MAX)
  content?: string;

  @ApiProperty({ enum: CAMPUS_LOCATIONS, required: false, nullable: true })
  @IsOptional()
  @ValidateIf((_o, value) => value !== null)
  @IsIn(CAMPUS_LOCATIONS)
  location?: CampusLocation | null;

  /** Solo eventos: fecha y hora en ISO 8601. */
  @IsOptional()
  @IsDateString()
  eventStartsAt?: string;

  /** Solo eventos. */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  eventLocation?: string;

  /** Solo publicaciones de código. */
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  codeSnippet?: string;

  /** Solo grupos de estudio. */
  @IsOptional()
  @IsString()
  @MaxLength(80)
  groupName?: string;

  /** Solo grupos de estudio. */
  @IsOptional()
  @IsInt()
  @Min(1)
  groupSpots?: number;
}
