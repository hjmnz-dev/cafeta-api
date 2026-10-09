import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { stateChangeArgs } from '../../common/soft-delete/soft-delete.js';

type PostWriter = Pick<Prisma.TransactionClient, 'post'>;

// Lo que la moderación (spec 0009, decisión 33) puede hacerle a una
// publicación ajena: darla de baja lógica. Quien llama registra la auditoría
// con su propio contexto, dentro de la misma transacción.
@Injectable()
export class PostModerationService {
  // false si ya estaba desactivada o no existe (nada que cambiar).
  async deactivate(
    tx: PostWriter,
    postId: string,
    now: Date,
  ): Promise<boolean> {
    const { count } = await tx.post.updateMany(
      stateChangeArgs(postId, 'deactivate', now),
    );
    return count > 0;
  }
}
