import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { StoryAccessService } from './story-access.service.js';

// Marcar una historia como vista (bug 1068): la primera vez que alguien la abre
// queda una fila; repetir no hace nada. Solo quien puede verla la marca (la
// misma regla de reaccionar y comentar: si no la ve, responde 404). No se
// audita ni avisa a nadie.
@Injectable()
export class StoryViewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: StoryAccessService,
  ) {}

  async markViewed(storyId: string, viewerId: string): Promise<void> {
    await this.access.authorIdOf(storyId, viewerId);
    await this.prisma.storyView.createMany({
      data: [{ storyId, viewerId }],
      skipDuplicates: true,
    });
  }
}
