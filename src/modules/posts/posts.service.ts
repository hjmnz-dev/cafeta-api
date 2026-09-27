import { BadRequestException, Injectable } from '@nestjs/common';
import type {
  ActorContext,
  AuthenticatedUser,
} from '../../common/actor/actor-context.js';
import { AuditService } from '../../common/audit/audit.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { CreatePostDto } from './dto/create-post.dto.js';
import type { PostViewDto } from './dto/post-view.dto.js';
import { POST_VIEW_SELECT } from './post-queries.js';
import { toPostView } from './post-view.mapper.js';

// Escritura de publicaciones (spec 0005). Hoy solo crea texto.
@Injectable()
export class PostsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // El autor sale del token y el tipo es siempre TEXT; el cuerpo no los trae.
  async create(
    dto: CreatePostDto,
    user: AuthenticatedUser,
    actor: ActorContext,
  ): Promise<PostViewDto> {
    const content = dto.content.trim();
    if (content.length === 0) {
      throw new BadRequestException({
        message: 'La publicación no puede estar vacía',
        code: 'POST_CONTENT_REQUIRED',
      });
    }
    const row = await this.prisma.$transaction(async (tx) => {
      const post = await tx.post.create({
        data: {
          authorId: user.id,
          type: 'TEXT',
          content,
          location: dto.location ?? null,
        },
        select: POST_VIEW_SELECT,
      });
      await this.audit.record(tx, {
        action: 'post.create',
        entityType: 'post',
        entityId: post.id,
        actor,
        succeeded: true,
      });
      return post;
    });
    return toPostView(row);
  }
}
