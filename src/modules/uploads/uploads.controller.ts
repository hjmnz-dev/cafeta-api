import {
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../../common/actor/actor-context.js';
import { CurrentUser } from '../../common/actor/current-user.decorator.js';
import { UploadFileDto, UploadViewDto } from './dto/upload-view.dto.js';
import { UPLOAD_MAX_BYTES } from './media-formats.js';
import { MulterErrorsInterceptor } from './multer-errors.interceptor.js';
import { type IncomingFile, UploadsService } from './uploads.service.js';

@ApiTags('uploads')
@ApiBearerAuth()
@Controller('uploads')
export class UploadsController {
  constructor(private readonly uploads: UploadsService) {}

  // Sin dest, multer deja el archivo completo en memoria (hasta 25 MB) y sube a Blob desde aquí.
  @Post()
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: UploadFileDto })
  @UseInterceptors(
    MulterErrorsInterceptor,
    FileInterceptor('file', {
      limits: { fileSize: UPLOAD_MAX_BYTES, files: 1 },
    }),
  )
  upload(
    @UploadedFile() file: IncomingFile | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<UploadViewDto> {
    return this.uploads.upload(file, user);
  }
}
