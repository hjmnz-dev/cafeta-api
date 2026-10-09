import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { afterCursor, POST_ORDER } from '../posts/post-queries.js';
import type { PageQueryDto } from '../posts/dto/page-query.dto.js';
import { MediaUrlService } from '../uploads/media-url.service.js';
import {
  ANNOUNCEMENT_SELECT,
  ANNOUNCEMENT_WHERE,
} from './announcement-queries.js';
import { toAnnouncementPage } from './announcement-view.mapper.js';
import type { AdminAnnouncementPageDto } from './dto/admin-announcement-view.dto.js';

// Lista de anuncios de la consola (decisión 36): activos y desactivados, del
// más nuevo al más antiguo, con cursor.
@Injectable()
export class AnnouncementsReadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly urls: MediaUrlService,
  ) {}

  async list({
    cursor,
    limit,
  }: PageQueryDto): Promise<AdminAnnouncementPageDto> {
    const after = cursor ? await this.afterOf(cursor) : null;
    const rows = await this.prisma.post.findMany({
      where: after ? { AND: [ANNOUNCEMENT_WHERE, after] } : ANNOUNCEMENT_WHERE,
      orderBy: POST_ORDER,
      take: limit + 1,
      select: ANNOUNCEMENT_SELECT,
    });
    return toAnnouncementPage(rows, limit, (key) => this.urls.urlFor(key));
  }

  // El cursor debe ser un anuncio: el de una publicación común no sirve.
  private async afterOf(id: string) {
    const row = await this.prisma.post.findFirst({
      where: { AND: [{ id }, ANNOUNCEMENT_WHERE] },
      select: { createdAt: true },
    });
    if (!row) {
      throw new BadRequestException({
        message: 'El cursor no corresponde a ningún anuncio',
        code: 'INVALID_CURSOR',
      });
    }
    return afterCursor(row.createdAt, id);
  }
}
