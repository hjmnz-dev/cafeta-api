import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { PageQueryDto } from '../posts/dto/page-query.dto.js';
import { MediaUrlService } from '../uploads/media-url.service.js';
import { VisibilityService } from '../visibility/visibility.service.js';
import type { SearchUserPageDto } from './dto/search-user-view.dto.js';
import { inOrderOf, windowAfter } from './search-paging.js';
import { searchUserSelect, toSearchUserView } from './search-user-view.js';

// Cuántas personas se consideran como sugerencia; Descubrir no es un directorio
// completo, para eso está la búsqueda.
const CANDIDATES = 200;

// Personas sugeridas en Descubrir: reemplaza el directorio de demostración
// (bugs 1031 y 1033). Estudiantes activos que quien mira todavía no sigue (ni
// tiene solicitud pendiente), sin bloqueos con él; primero los de su carrera y,
// dentro de cada grupo, las cuentas más nuevas.
@Injectable()
export class DiscoverPeopleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly visibility: VisibilityService,
    private readonly urls: MediaUrlService,
  ) {}

  async people(
    viewerId: string,
    { cursor, limit }: PageQueryDto,
  ): Promise<SearchUserPageDto> {
    const me = await this.prisma.profile.findUnique({
      where: { userId: viewerId },
      select: { careerId: true },
    });
    const candidates = await this.prisma.user.findMany({
      where: {
        AND: [
          { id: { not: viewerId }, role: 'STUDENT', profile: { isNot: null } },
          this.visibility.profileWhere(viewerId),
          {
            followers: { none: { followerId: viewerId, deactivatedAt: null } },
          },
        ],
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: CANDIDATES,
      select: { id: true, profile: { select: { careerId: true } } },
    });
    const sameCareer = (c: (typeof candidates)[number]) =>
      me?.careerId != null && c.profile?.careerId === me.careerId;
    const ids = [
      ...candidates.filter(sameCareer),
      ...candidates.filter((c) => !sameCareer(c)),
    ].map((c) => c.id);
    const window = windowAfter(ids, cursor, limit);
    if (!window.ok) {
      throw new BadRequestException({
        message: 'El cursor no corresponde a ningún elemento de esta lista',
        code: 'INVALID_CURSOR',
      });
    }
    const rows = await this.prisma.user.findMany({
      where: { id: { in: window.ids } },
      select: searchUserSelect(viewerId),
    });
    return {
      items: inOrderOf(window.ids, rows).map((row) =>
        toSearchUserView(row, (key) => this.urls.urlFor(key)),
      ),
      nextCursor: window.hasMore ? (window.ids.at(-1) ?? null) : null,
    };
  }
}
