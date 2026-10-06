import {
  BadRequestException,
  Injectable,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { AuthenticatedUser } from '../../common/actor/actor-context.js';
import type { UploadViewDto } from './dto/upload-view.dto.js';
import { ALLOWED_FORMATS_TEXT, sniffMediaFormat } from './media-formats.js';
import { MediaStorage } from './media-storage.js';
import { MediaUrlService } from './media-url.service.js';

export interface IncomingFile {
  buffer: Buffer;
  size: number;
}

const FOLDER = { IMAGE: 'image', VIDEO: 'video', DOCUMENT: 'document' };

// Subida de archivos (spec 0008, decisión 13): valida por los primeros bytes,
// guarda con clave aleatoria y responde un enlace SAS.
@Injectable()
export class UploadsService {
  constructor(
    private readonly storage: MediaStorage,
    private readonly urls: MediaUrlService,
  ) {}

  async upload(
    file: IncomingFile | undefined,
    user: AuthenticatedUser,
  ): Promise<UploadViewDto> {
    if (!file || file.size === 0) {
      throw new BadRequestException({
        message: 'Adjunta un archivo en el campo file',
        code: 'FILE_REQUIRED',
      });
    }
    const format = sniffMediaFormat(file.buffer);
    if (!format) {
      throw new UnsupportedMediaTypeException({
        message: `Formato no permitido. Se aceptan ${ALLOWED_FORMATS_TEXT}`,
        code: 'UNSUPPORTED_MEDIA_TYPE',
      });
    }
    if (file.size > format.maxBytes) {
      throw new PayloadTooLargeException({
        message: `El archivo pasa del límite. Se aceptan ${ALLOWED_FORMATS_TEXT}`,
        code: 'FILE_TOO_LARGE',
      });
    }
    const key = `${FOLDER[format.mediaType]}/${randomUUID()}.${format.extension}`;
    await this.storage.put(key, file.buffer, format.mimeType, user.id);
    return {
      key,
      url: this.urls.urlFor(key),
      mediaType: format.mediaType,
      mimeType: format.mimeType,
      sizeBytes: file.size,
    };
  }
}
