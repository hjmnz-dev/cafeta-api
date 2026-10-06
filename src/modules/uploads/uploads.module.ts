import { Module } from '@nestjs/common';
import { AzureBlobStorage } from './azure-blob.storage.js';
import { MediaStorage } from './media-storage.js';
import { MediaUrlService } from './media-url.service.js';
import { UploadsController } from './uploads.controller.js';
import { UploadsService } from './uploads.service.js';

// Subida de archivos (spec 0008, decisión 13). Exporta MediaUrlService para
// que cada módulo convierta claves en enlaces, y MediaStorage para validar y
// borrar archivos.
@Module({
  controllers: [UploadsController],
  providers: [
    UploadsService,
    MediaUrlService,
    { provide: MediaStorage, useClass: AzureBlobStorage },
  ],
  exports: [MediaUrlService, MediaStorage],
})
export class UploadsModule {}
