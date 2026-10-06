import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  canSeeContent,
  canSeeProfile,
  contentVisibleTo,
  type VisibilityFacts,
} from './visibility-rules.js';

// El único lugar que decide quién ve el contenido de quién (decisión 15).
// Combina privacidad, seguimiento, bloqueo y desactivación; ningún otro módulo
// vuelve a escribir esta regla.
@Injectable()
export class VisibilityService {
  constructor(private readonly prisma: PrismaService) {}

  // null si el dueño no existe o no tiene perfil.
  async facts(
    viewerId: string,
    ownerId: string,
  ): Promise<VisibilityFacts | null> {
    const owner = await this.prisma.user.findUnique({
      where: { id: ownerId },
      select: {
        deactivatedAt: true,
        profile: { select: { visibility: true } },
        followers: {
          where: { followerId: viewerId, deactivatedAt: null },
          select: { status: true },
        },
        blocksMade: {
          where: { blockedId: viewerId, deactivatedAt: null },
          select: { id: true },
        },
        blocksReceived: {
          where: { blockerId: viewerId, deactivatedAt: null },
          select: { id: true },
        },
      },
    });
    if (!owner?.profile) return null;
    return {
      isSelf: viewerId === ownerId,
      ownerActive: owner.deactivatedAt === null,
      visibility: owner.profile.visibility,
      followStatus: owner.followers[0]?.status ?? null,
      blocked: owner.blocksMade.length > 0 || owner.blocksReceived.length > 0,
    };
  }

  async canSeeContent(viewerId: string, ownerId: string): Promise<boolean> {
    const facts = await this.facts(viewerId, ownerId);
    return facts !== null && canSeeContent(facts);
  }

  // Los hechos de un perfil que quien mira puede ver; si no, 404 como si no
  // existiera (decisión 29).
  async visibleProfileFacts(
    viewerId: string,
    ownerId: string,
  ): Promise<VisibilityFacts> {
    const facts = await this.facts(viewerId, ownerId);
    if (!facts || !canSeeProfile(facts)) {
      throw new NotFoundException({
        message: 'El usuario no existe',
        code: 'USER_NOT_FOUND',
      });
    }
    return facts;
  }

  // Filtro para las listas: autores cuyo contenido ve quien mira.
  contentAuthorWhere(viewerId: string): Prisma.UserWhereInput {
    return contentVisibleTo(viewerId);
  }
}
