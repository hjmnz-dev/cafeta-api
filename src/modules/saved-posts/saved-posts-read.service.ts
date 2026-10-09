import { BadRequestException, Injectable } from '@nestjs/common';
import { ACTIVE } from '../../common/soft-delete/soft-delete.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { PageQueryDto } from '../posts/dto/page-query.dto.js';
import type { PostPageDto } from '../posts/dto/post-page.dto.js';
import { postViewSelect, VISIBLE_POST } from '../posts/post-queries.js';
import { toPostView } from '../posts/post-view.mapper.js';
import { MediaUrlService } from '../uploads/media-url.service.js';
import { VisibilityService } from '../visibility/visibility.service.js';

// Mi lista de guardadas (spec 0009, decisión 19): de la guardada más reciente a
// la más antigua, con la misma forma de tarjeta que el feed. Lo que dejó de ser
// visible (autor desactivado o con bloqueo, publicación archivada o con
// privacidad cerrada) se omite sin avisar y vuelve solo si vuelve a verse.
@Injectable()
export class SavedPostsReadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly urls: MediaUrlService,
    private readonly visibility: VisibilityService,
  ) {}

  async list(
    userId: string,
    { cursor, limit }: PageQueryDto,
  ): Promise<PostPageDto> {
    const where: Prisma.SavedPostWhereInput = {
      userId,
      ...ACTIVE,
      post: {
        AND: [
          VISIBLE_POST,
          { author: this.visibility.contentAuthorWhere(userId) },
        ],
      },
    };
    const after = cursor ? await this.afterCursorOf(userId, cursor) : null;
    const rows = await this.prisma.savedPost.findMany({
      where: after ? { AND: [where, after] } : where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      select: { id: true, post: { select: postViewSelect(userId) } },
    });
    const items = rows.slice(0, limit);
    const last = items.at(-1);
    return {
      items: items.map((row) =>
        toPostView(row.post, (key) => this.urls.urlFor(key)),
      ),
      // El cursor es el id de la fila guardada, no el de la publicación.
      nextCursor: rows.length > limit && last ? last.id : null,
    };
  }

  // No se usa el cursor nativo de Prisma: una guardada que ya no existe daría
  // una lista vacía y la web creería que terminó.
  private async afterCursorOf(
    userId: string,
    id: string,
  ): Promise<Prisma.SavedPostWhereInput> {
    const saved = await this.prisma.savedPost.findFirst({
      where: { id, userId },
      select: { createdAt: true },
    });
    if (!saved) {
      throw new BadRequestException({
        message: 'El cursor no corresponde a ninguna publicación guardada',
        code: 'INVALID_CURSOR',
      });
    }
    return {
      OR: [
        { createdAt: { lt: saved.createdAt } },
        { createdAt: saved.createdAt, id: { lt: id } },
      ],
    };
  }
}
