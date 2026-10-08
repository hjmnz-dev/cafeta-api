import { IsString } from 'class-validator';
import { MaxCodePoints } from '../../posts/dto/create-post.dto.js';
import { STORY_TEXT_MAX } from './create-story.dto.js';

export class EditStoryDto {
  /** Texto nuevo, de hasta 280 caracteres. Vacío quita el texto: la imagen o el video ya son obligatorios. */
  @IsString()
  @MaxCodePoints(STORY_TEXT_MAX)
  text: string;
}
