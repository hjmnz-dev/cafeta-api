import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { VISIBLE_POST } from '../posts/post-queries.js';
import { VisibilityService } from '../visibility/visibility.service.js';

// Quién puede comentar en una publicación: solo quien la ve. Si no existe,
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
      throw new NotFoundException({
        message: 'La publicación no existe',
        code: 'POST_NOT_FOUND',
      });
    }
    return post.authorId;
  }
}
