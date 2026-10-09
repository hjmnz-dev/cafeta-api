import { Injectable } from '@nestjs/common';
import type {
  ActorContext,
  AuthenticatedUser,
} from '../../common/actor/actor-context.js';
import type { PostViewDto } from '../posts/dto/post-view.dto.js';
import { PostsService, postContentRequired } from '../posts/posts.service.js';
import type { CreateAnnouncementDto } from './dto/create-announcement.dto.js';

// Publicar un anuncio (spec 0009, decisión 36): el mismo servicio que publica
// con adjuntos, con el tipo ANNOUNCEMENT y la auditoría announcement.create
// fijados aquí, no por el cuerpo. Editar y desactivar usan las rutas de
// /posts, porque el admin es el autor.
@Injectable()
export class AnnouncementsService {
  constructor(private readonly posts: PostsService) {}

  async create(
    dto: CreateAnnouncementDto,
    user: AuthenticatedUser,
    actor: ActorContext,
  ): Promise<PostViewDto> {
    // El texto es obligatorio: unos adjuntos solos no son un anuncio.
    if (dto.content.trim().length === 0) throw postContentRequired();
    return this.posts.publish(
      { content: dto.content, mediaKeys: dto.mediaKeys },
      user,
      actor,
      { type: 'ANNOUNCEMENT', action: 'announcement.create' },
    );
  }
}
