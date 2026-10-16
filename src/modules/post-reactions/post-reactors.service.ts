import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ACTIVE } from '../../common/soft-delete/soft-delete.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  toFollowUserView,
  USER_CARD_SELECT,
} from '../follows/follow-queries.js';
import type { PageQueryDto } from '../posts/dto/page-query.dto.js';
import { PostAccessService } from '../posts/post-access.service.js';
import { MediaUrlService } from '../uploads/media-url.service.js';
import type { PostReactorPageDto } from './dto/post-reactor.dto.js';

const REACTOR_ORDER = [
  { createdAt: 'desc' },
  { id: 'desc' },
] satisfies Prisma.PostReactionOrderByWithRelationInput[];

// Quién reaccionó a mi publicación y con qué (bug 1076): solo para su autor,
// con las mismas reacciones que cuenta reactionCount (activas y de cuentas
// activas), de la más nueva a la más antigua. Quien no es el autor ve el
// conteo, nunca la lista.
@Injectable()
export class PostReactorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: PostAccessService,
    private readonly urls: MediaUrlService,
  ) {}

  async list(
    postId: string,
    { cursor, limit }: PageQueryDto,
    userId: string,
  ): Promise<PostReactorPageDto> {
    const authorId = await this.access.readableAuthorIdOf(postId, userId);
    if (authorId !== userId) {
      throw new ForbiddenException({
        message: 'Solo quien publicó ve quién reaccionó',
        code: 'NOT_POST_AUTHOR',
      });
    }
    const where: Prisma.PostReactionWhereInput = {
      postId,
      ...ACTIVE,
      user: ACTIVE,
    };
    const after = cursor ? await this.afterCursorOf(postId, cursor) : null;
    const rows = await this.prisma.postReaction.findMany({
      where: after ? { AND: [where, after] } : where,
      orderBy: REACTOR_ORDER,
      take: limit + 1,
      select: {
        id: true,
        type: true,
        createdAt: true,
        user: { select: USER_CARD_SELECT },
      },
    });
    const page = rows.slice(0, limit);
    return {
      items: page.map((row) => ({
        id: row.id,
        type: row.type,
        createdAt: row.createdAt,
        user: toFollowUserView(row.user, (key) => this.urls.urlFor(key)),
      })),
      nextCursor: rows.length > limit ? (page.at(-1)?.id ?? null) : null,
    };
  }

  // No se usa el cursor nativo de Prisma: una reacción que ya no existe daría
  // una lista vacía y la web creería que terminó.
  private async afterCursorOf(
    postId: string,
    id: string,
  ): Promise<Prisma.PostReactionWhereInput> {
    const reaction = await this.prisma.postReaction.findFirst({
      where: { id, postId },
      select: { createdAt: true },
    });
    if (!reaction) {
      throw new BadRequestException({
        message: 'El cursor no corresponde a ninguna reacción',
        code: 'INVALID_CURSOR',
      });
    }
    return {
      OR: [
        { createdAt: { lt: reaction.createdAt } },
        { createdAt: reaction.createdAt, id: { lt: id } },
      ],
    };
  }
}
