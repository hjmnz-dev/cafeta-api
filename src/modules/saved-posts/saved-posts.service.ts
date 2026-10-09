import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { PostAccessService } from '../posts/post-access.service.js';

// Guardar y quitar publicaciones de mi lista (spec 0009, decisión 19). Las dos
// acciones son idempotentes, así un reintento de red o un doble toque no deja
// el estado al revés. Guardar no se audita, igual que reaccionar.
@Injectable()
export class SavedPostsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: PostAccessService,
  ) {}

  // Crea la fila o reactiva una quitada, que vuelve al inicio de la lista
  // porque su createdAt pasa a ser ahora. Guardar lo que ya estaba guardado no
  // cambia nada: skipDuplicates y la unicidad (userId, postId) cierran la
  // carrera de dos toques seguidos.
  async save(postId: string, userId: string): Promise<void> {
    const authorId = await this.access.authorIdOf(postId, userId);
    if (authorId === userId) {
      throw new BadRequestException({
        message: 'No puedes guardar tu propia publicación',
        code: 'CANNOT_SAVE_OWN_POST',
      });
    }
    const reactivated = await this.prisma.savedPost.updateMany({
      where: { postId, userId, deactivatedAt: { not: null } },
      data: { deactivatedAt: null, createdAt: new Date() },
    });
    if (reactivated.count > 0) return;
    await this.prisma.savedPost.createMany({
      data: [{ postId, userId }],
      skipDuplicates: true,
    });
  }

  // Baja lógica. No pide ver la publicación: quitar siempre se puede, aunque ya
  // no sea visible. Sin fila activa no hace nada y tampoco falla.
  async remove(postId: string, userId: string): Promise<void> {
    await this.prisma.savedPost.updateMany({
      where: { postId, userId, deactivatedAt: null },
      data: { deactivatedAt: new Date() },
    });
  }
}
