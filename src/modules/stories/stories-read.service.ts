import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { MediaUrlService } from '../uploads/media-url.service.js';
import { VisibilityService } from '../visibility/visibility.service.js';
import type { StoryTrayDto } from './dto/story-view.dto.js';
import { STORY_VIEW_SELECT, TRAY_LIMIT, trayWhere } from './story-queries.js';
import { toStoryTray } from './story-view.mapper.js';

// Lectura de historias vigentes. La privacidad y los bloqueos los decide
// VisibilityService (decisión 15); vencer se resuelve al leer, sin procesos.
@Injectable()
export class StoriesReadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly urls: MediaUrlService,
    private readonly visibility: VisibilityService,
  ) {}

  async tray(viewerId: string): Promise<StoryTrayDto> {
    const rows = await this.prisma.story.findMany({
      where: trayWhere(
        viewerId,
        this.visibility.contentAuthorWhere(viewerId),
        new Date(),
      ),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: TRAY_LIMIT,
      select: STORY_VIEW_SELECT,
    });
    return toStoryTray(rows, (key) => this.urls.urlFor(key));
  }
}
