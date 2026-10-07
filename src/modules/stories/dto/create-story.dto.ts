import { IsOptional, IsString, Matches } from 'class-validator';
import { MEDIA_KEY_PATTERN } from '../../uploads/media-formats.js';
import { MaxCodePoints } from '../../posts/dto/create-post.dto.js';

export const STORY_TEXT_MAX = 280;

export class CreateStoryDto {
  /** Clave que devolvió POST /uploads: una imagen o un video (obligatorio). */
  @Matches(MEDIA_KEY_PATTERN, { message: 'mediaKey trae una clave inválida' })
  mediaKey: string;

  /** Texto opcional de hasta 280 caracteres. */
  @IsOptional()
  @IsString()
  @MaxCodePoints(STORY_TEXT_MAX)
  text?: string;
}
