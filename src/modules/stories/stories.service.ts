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
import type { CreateStoryDto } from './dto/create-story.dto.js';
import type { StoryViewDto } from './dto/story-view.dto.js';
import { STORY_TTL_MS, storyViewSelect } from './story-queries.js';
import { toStoryView } from './story-view.mapper.js';

const mediaNotFound = () =>
  new BadRequestException({
    message: 'El archivo no existe o no lo subiste tú',
    code: 'MEDIA_NOT_FOUND',
  });

const mediaNotAllowed = () =>
  new BadRequestException({
    message: 'Una historia lleva una imagen o un video',
    code: 'STORY_MEDIA_INVALID',
  });

// Escritura de historias (spec 0008, decisión 22). El medio es una clave de
// POST /uploads que el mismo autor subió; el texto es opcional.
@Injectable()
export class StoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly storage: MediaStorage,
    private readonly urls: MediaUrlService,
  ) {}

  // El autor sale del token; expiresAt se fija al crear y nunca cambia.
  async create(
    dto: CreateStoryDto,
    user: AuthenticatedUser,
    actor: ActorContext,
  ): Promise<StoryViewDto> {
    const stored = await this.storage.describe(dto.mediaKey);
    const format = stored && formatForMimeType(stored.contentType);
    if (!stored || !format || stored.ownerId !== user.id) {
      throw mediaNotFound();
    }
    if (format.mediaType === 'DOCUMENT') throw mediaNotAllowed();

    const now = new Date();
    const row = await this.prisma.$transaction(async (tx) => {
      const story = await tx.story.create({
        data: {
          authorId: user.id,
          text: dto.text?.trim() || null,
          mediaKey: dto.mediaKey,
          mediaType: format.mediaType,
          mediaMimeType: format.mimeType,
          createdAt: now,
          expiresAt: new Date(now.getTime() + STORY_TTL_MS),
        },
        select: storyViewSelect(user.id),
      });
      await this.audit.record(tx, {
        action: 'story.create',
        entityType: 'story',
        entityId: story.id,
        actor,
        succeeded: true,
      });
      return story;
    });
    const view = toStoryView(row, user.id, (key) => this.urls.urlFor(key));
    if (!view) throw mediaNotAllowed();
    return view;
  }
}
