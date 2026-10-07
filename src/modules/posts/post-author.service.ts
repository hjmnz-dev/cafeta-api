import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type {
  ActorContext,
  AuthenticatedUser,
} from '../../common/actor/actor-context.js';
import type { AuditAction } from '../../common/audit/audit-actions.js';
import { AuditService } from '../../common/audit/audit.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import {
  stateChangeArgs,
  stateChangeError,
  type StateChange,
} from '../../common/soft-delete/soft-delete.js';
import type { PostType } from '../../generated/prisma/enums.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { MediaStorage } from '../uploads/media-storage.js';
import { MediaUrlService } from '../uploads/media-url.service.js';
import type { PostViewDto } from './dto/post-view.dto.js';
import type { UpdatePostDto } from './dto/update-post.dto.js';
import { postViewSelect } from './post-queries.js';
import { toPostView } from './post-view.mapper.js';
import { postContentRequired } from './posts.service.js';

// Campos que cada tipo deja editar además del texto y la ubicación.
const TYPE_FIELDS: Readonly<Record<string, readonly PostType[]>> = {
  eventStartsAt: ['EVENT'],
  eventLocation: ['EVENT'],
  codeSnippet: ['CODE'],
  groupName: ['STUDY_GROUP'],
  groupSpots: ['STUDY_GROUP'],
};

interface OwnedPost {
  id: string;
  type: PostType;
  deactivatedAt: Date | null;
  _count: { media: number };
}

// Acciones del autor sobre su publicación (spec 0008, decisión 17): editar,
// desactivar, reactivar y eliminar. Solo el autor; todo queda auditado.
@Injectable()
export class PostAuthorService {
  private readonly logger = new Logger(PostAuthorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly storage: MediaStorage,
    private readonly urls: MediaUrlService,
  ) {}

  // Conserva reacciones, comentarios y adjuntos; marca editedAt ("editado").
  async update(
    id: string,
    dto: UpdatePostDto,
    user: AuthenticatedUser,
    actor: ActorContext,
  ): Promise<PostViewDto> {
    const post = await this.owned(id, user);
    if (post.deactivatedAt) {
      throw new ConflictException({
        message: 'Reactiva la publicación antes de editarla',
        code: 'POST_INACTIVE',
      });
    }
    for (const [field, types] of Object.entries(TYPE_FIELDS)) {
      const value = dto[field as keyof UpdatePostDto];
      if (value !== undefined && !types.includes(post.type)) {
        throw new BadRequestException({
          message: `${field} no aplica a este tipo de publicación`,
          code: 'POST_FIELD_NOT_ALLOWED',
        });
      }
    }
    const content = dto.content === undefined ? undefined : dto.content.trim();
    if (content === '' && post._count.media === 0) {
      throw postContentRequired();
    }
    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.post.update({
        where: { id },
        data: {
          content: content === undefined ? undefined : content || null,
          location: dto.location,
          eventStartsAt:
            dto.eventStartsAt === undefined
              ? undefined
              : new Date(dto.eventStartsAt),
          eventLocation: dto.eventLocation,
          codeSnippet: dto.codeSnippet,
          groupName: dto.groupName,
          groupSpots: dto.groupSpots,
          editedAt: new Date(),
        },
        select: postViewSelect(user.id),
      });
      await this.record(tx, 'post.update', id, actor);
      return updated;
    });
    return toPostView(row, (key) => this.urls.urlFor(key));
  }

  // Baja lógica: la oculta de todos y la conserva (HU23).
  async changeState(
    id: string,
    change: StateChange,
    user: AuthenticatedUser,
    actor: ActorContext,
  ): Promise<void> {
    await this.owned(id, user);
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.post.updateMany(
        stateChangeArgs(id, change, new Date()),
      );
      if (count === 0) throw stateChangeError(true, change);
      await this.record(tx, `post.${change}`, id, actor);
    });
  }

  // Borrado real con confirmación en la web: reacciones, comentarios y demás
  // caen en cascada; sus archivos se borran de Blob después del commit.
  async remove(
    id: string,
    user: AuthenticatedUser,
    actor: ActorContext,
  ): Promise<void> {
    await this.owned(id, user);
    const keys = await this.prisma.$transaction(async (tx) => {
      const media = await tx.postMedia.findMany({
        where: { postId: id },
        select: { storageKey: true },
      });
      await this.record(tx, 'post.delete', id, actor);
      await tx.post.delete({ where: { id } });
      return media.map((m) => m.storageKey);
    });
    // Si Blob falla, la publicación ya no existe: queda un archivo huérfano
    // que nadie puede leer, y se registra para limpiarlo a mano.
    const results = await Promise.allSettled(
      keys.map((key) => this.storage.remove(key)),
    );
    results.forEach((result, i) => {
      if (result.status === 'rejected') {
        this.logger.error(`No se pudo borrar ${keys[i]} de Blob`);
      }
    });
  }

  // 404 si no existe (aunque esté desactivada, el autor la ve); 403 si es de
  // otra persona (HU22 E2, HU23 E2), que el filtro audita como access.denied.
  private async owned(id: string, user: AuthenticatedUser): Promise<OwnedPost> {
    const post = await this.prisma.post.findUnique({
      where: { id },
      select: {
        id: true,
        authorId: true,
        type: true,
        deactivatedAt: true,
        _count: { select: { media: true } },
      },
    });
    if (!post) {
      throw new NotFoundException({
        message: 'La publicación no existe',
        code: 'POST_NOT_FOUND',
      });
    }
    if (post.authorId !== user.id) {
      throw new ForbiddenException({
        message: 'Solo el autor puede cambiar esta publicación',
        code: 'NOT_POST_AUTHOR',
      });
    }
    return post;
  }

  private record(
    tx: Prisma.TransactionClient,
    action: AuditAction,
    entityId: string,
    actor: ActorContext,
  ) {
    return this.audit.record(tx, {
      action,
      entityType: 'post',
      entityId,
      actor,
      succeeded: true,
    });
  }
}
