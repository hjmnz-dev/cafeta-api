import { ApiProperty } from '@nestjs/swagger';
import { MediaType } from '../../../generated/prisma/enums.js';

export class UploadFileDto {
  @ApiProperty({ type: 'string', format: 'binary' })
  file: unknown;
}

export class UploadViewDto {
  /** Clave del archivo; se manda de vuelta al publicar. @example image/0192f0c4-7d1a-7c3e-9a51-3c2b8e1f4a10.jpg */
  key: string;
  /** Enlace de lectura que vence en una hora como máximo. */
  url: string;
  @ApiProperty({ enum: MediaType, enumName: 'MediaType' })
  mediaType: MediaType;
  /** @example image/jpeg */
  mimeType: string;
  sizeBytes: number;
}
