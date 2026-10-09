import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';
import { MEDIA_KEY_PATTERN } from '../../uploads/media-formats.js';
import {
  MaxCodePoints,
  POST_CONTENT_MAX,
  POST_MEDIA_MAX,
} from '../../posts/dto/create-post.dto.js';

// POST /admin/announcements: el texto es obligatorio y los adjuntos son los
// mismos de las publicaciones (spec 0009, decisión 36). El tipo y el autor
// los fija el servidor.
export class CreateAnnouncementDto {
  /** Texto del anuncio, de 1 a 2000 caracteres. */
  @IsString()
  @IsNotEmpty()
  @MaxCodePoints(POST_CONTENT_MAX)
  content: string;

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
