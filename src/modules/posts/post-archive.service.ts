import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  ActorContext,
  AuthenticatedUser,
} from '../../common/actor/actor-context.js';
import { AuditService } from '../../common/audit/audit.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';

type Change = 'archive' | 'restore';

// Archivar y restaurar mis publicaciones (HU21): una decisión reversible y
// personal, distinta de desactivar (HU23). Solo el autor.
@Injectable()
export class PostArchiveService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  archive(id: string, user: AuthenticatedUser, actor: ActorContext) {
    return this.change('archive', id, user, actor);
  }

  restore(id: string, user: AuthenticatedUser, actor: ActorContext) {
    return this.change('restore', id, user, actor);
  }

  // El updateMany condicional hace que dos peticiones a la vez no ganen las dos.
  private async change(
    change: Change,
    id: string,
    user: AuthenticatedUser,
    actor: ActorContext,
  ): Promise<void> {
    const archiving = change === 'archive';
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.post.updateMany({
        where: {
          id,
          authorId: user.id,
          deactivatedAt: null,
          archivedAt: archiving ? null : { not: null },
        },
        data: { archivedAt: archiving ? new Date() : null },
      });
      if (count === 0) throw await this.whyNot(change, id, user.id);
      await this.audit.record(tx, {
        action: `post.${change}`,
        entityType: 'post',
        entityId: id,
        actor,
        succeeded: true,
      });
    });
  }

  private async whyNot(change: Change, id: string, userId: string) {
    const post = await this.prisma.post.findUnique({
      where: { id },
      select: { authorId: true, archivedAt: true, deactivatedAt: true },
    });
    if (!post) {
      return new NotFoundException({
        message: 'La publicación no existe',
        code: 'POST_NOT_FOUND',
      });
    }
    if (post.authorId !== userId) {
      return new ForbiddenException({
        message: 'Solo el autor puede cambiar esta publicación',
        code: 'NOT_POST_AUTHOR',
      });
    }
    if (post.deactivatedAt) {
      return new ConflictException({
        message: 'Reactiva la publicación antes de archivarla o restaurarla',
        code: 'POST_INACTIVE',
      });
    }
    return new ConflictException(
      change === 'archive'
        ? { message: 'Ya estaba archivada', code: 'ALREADY_ARCHIVED' }
        : { message: 'No estaba archivada', code: 'NOT_ARCHIVED' },
    );
  }
}
