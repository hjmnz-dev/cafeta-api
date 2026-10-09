import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { VisibilityService } from '../visibility/visibility.service.js';
import { liveStoryWhere } from './story-queries.js';
import { storyNotFound } from './story-rules.js';

// Quién puede reaccionar y comentar una historia (spec 0009, decisión 24): solo
// quien la ve. Si no existe, está desactivada, ya venció o su autor no deja ver
// su contenido a quien pregunta (decisión 15), responde 404 como si no existiera.
@Injectable()
export class StoryAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly visibility: VisibilityService,
  ) {}

  // Devuelve el autor de la historia, para avisarle.
  async authorIdOf(storyId: string, viewerId: string): Promise<string> {
    const story = await this.prisma.story.findFirst({
      where: { id: storyId, ...liveStoryWhere(new Date()) },
      select: { authorId: true },
    });
    if (
      !story ||
      !(await this.visibility.canSeeContent(viewerId, story.authorId))
    ) {
      throw storyNotFound();
    }
    return story.authorId;
  }
}
