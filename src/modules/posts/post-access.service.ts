import { Injectable, NotFoundException } from '@nestjs/common';
import { ACTIVE } from '../../common/soft-delete/soft-delete.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { VISIBLE_POST } from './post-queries.js';
import { VisibilityService } from '../visibility/visibility.service.js';

// Quién puede interactuar con una publicación (comentar, guardar): solo quien
// la ve. Si no existe,
// está archivada o desactivada, o su autor no deja ver su contenido a quien
// pregunta (decisión 15), responde 404 como si no existiera.
@Injectable()
export class PostAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly visibility: VisibilityService,
  ) {}

  // Devuelve el autor de la publicación, para avisarle.
  async authorIdOf(postId: string, viewerId: string): Promise<string> {
    const post = await this.prisma.post.findFirst({
      where: { id: postId, ...VISIBLE_POST },
      select: { authorId: true },
    });
    if (
      !post ||
      !(await this.visibility.canSeeContent(viewerId, post.authorId))
    ) {
      throw postNotFound();
    }
    return post.authorId;
  }

  // Leer (no escribir) también vale para mis propias archivadas: las sigo
  // viendo en "Publicaciones archivadas" con su conteo de comentarios (bug
  // 1038). Para los demás es igual que authorIdOf.
  async readableAuthorIdOf(postId: string, viewerId: string): Promise<string> {
    const own = await this.prisma.post.findFirst({
      where: {
        id: postId,
        authorId: viewerId,
        deactivatedAt: null,
        archivedAt: { not: null },
        author: ACTIVE,
      },
      select: { authorId: true },
    });
    return own ? own.authorId : this.authorIdOf(postId, viewerId);
  }
}

function postNotFound(): NotFoundException {
  return new NotFoundException({
    message: 'La publicación no existe',
    code: 'POST_NOT_FOUND',
  });
}
