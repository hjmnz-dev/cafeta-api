import { BadRequestException, Injectable } from '@nestjs/common';
import type {
  ActorContext,
  AuthenticatedUser,
} from '../../common/actor/actor-context.js';
import { AuditService } from '../../common/audit/audit.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { formatForMimeType } from '../uploads/media-formats.js';
import { MediaStorage } from '../uploads/media-storage.js';
import { MediaUrlService } from '../uploads/media-url.service.js';
import type { CreatePostDto } from './dto/create-post.dto.js';
import type { PostViewDto } from './dto/post-view.dto.js';
import type { MediaType } from '../../generated/prisma/enums.js';
import { POST_VIEW_SELECT } from './post-queries.js';
import { toPostView } from './post-view.mapper.js';

interface MediaInput {
  storageKey: string;
  mediaType: MediaType;
  mimeType: string;
  sizeBytes: number;
  position: number;
}

const mediaNotFound = () =>
  new BadRequestException({
    message: 'Uno de los archivos no existe o no lo subiste tú',
    code: 'MEDIA_NOT_FOUND',
  });

// Escritura de publicaciones (spec 0005). Los adjuntos (spec 0008, decisión 13)
// son claves de POST /uploads que el mismo autor subió.
@Injectable()
export class PostsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly storage: MediaStorage,
    private readonly urls: MediaUrlService,
  ) {}

  // El autor sale del token y el tipo es siempre TEXT; el cuerpo no los trae.
  async create(
    dto: CreatePostDto,
    user: AuthenticatedUser,
    actor: ActorContext,
  ): Promise<PostViewDto> {
    const content = dto.content.trim();
    if (content.length === 0) {
      throw new BadRequestException({
        message: 'La publicación no puede estar vacía',
        code: 'POST_CONTENT_REQUIRED',
      });
    }
    const media = await this.resolveMedia(dto.mediaKeys ?? [], user.id);
    const row = await this.prisma.$transaction(async (tx) => {
      const post = await tx.post.create({
        data: {
          authorId: user.id,
          type: 'TEXT',
          content,
          location: dto.location ?? null,
          media: { create: media },
        },
        select: POST_VIEW_SELECT,
      });
      await this.audit.record(tx, {
        action: 'post.create',
        entityType: 'post',
        entityId: post.id,
        actor,
        succeeded: true,
      });
      return post;
    });
    return toPostView(row, (key) => this.urls.urlFor(key));
  }

  // Cada clave debe existir en Blob y ser del autor. Combinaciones válidas:
  // hasta 4 imágenes, o 1 video, o 1 PDF (spec 0008, decisión 17).
  private async resolveMedia(
    keys: string[],
    ownerId: string,
  ): Promise<MediaInput[]> {
    const media = await Promise.all(
      keys.map(async (storageKey, position) => {
        const stored = await this.storage.describe(storageKey);
        const format = stored && formatForMimeType(stored.contentType);
        if (!stored || !format || stored.ownerId !== ownerId) {
          throw mediaNotFound();
        }
        return {
          storageKey,
          mediaType: format.mediaType,
          mimeType: format.mimeType,
          sizeBytes: stored.sizeBytes,
          position,
        };
      }),
    );
    const onlyImages = media.every((m) => m.mediaType === 'IMAGE');
    if (media.length > 1 && !onlyImages) {
      throw new BadRequestException({
        message: 'Adjunta hasta 4 imágenes, o 1 video, o 1 PDF',
        code: 'MEDIA_COMBINATION_INVALID',
      });
    }
    return media;
  }
}
