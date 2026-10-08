import { Injectable, Logger } from '@nestjs/common';
import type { NotificationType } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { RealtimePublisher } from '../realtime/realtime.publisher.js';
import { VisibilityService } from '../visibility/visibility.service.js';
import { NOTIFICATION_VIEW_SELECT } from './notification-queries.js';
import { shouldNotify } from './notification-rules.js';
import { toNotificationView } from './notification-view.mapper.js';

export interface NotifyInput {
  recipientId: string;
  actorId: string | null;
  type: NotificationType;
  postId?: string;
  storyId?: string;
  conversationId?: string;
  // Si ya existe un aviso con el mismo receptor, actor, tipo y publicación, no
  // crea otro (spec 0009): quien reacciona y quita varias veces avisa una vez.
  once?: boolean;
}

// El punto único que crea avisos (spec 0008, decisión 27). Cada service lo
// llama DESPUÉS de confirmar su transacción: guarda el aviso y lo emite por
// el gateway de la 25 (notification:new).
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly visibility: VisibilityService,
    private readonly realtime: RealtimePublisher,
  ) {}

  // Nunca lanza: si el aviso falla, la acción que lo generó ya quedó hecha y
  // no debe responder error por eso.
  async notify(input: NotifyInput): Promise<void> {
    try {
      if (!(await this.allowed(input))) return;
      if (input.once && (await this.alreadySent(input))) return;
      const row = await this.prisma.notification.create({
        data: {
          recipientId: input.recipientId,
          actorId: input.actorId,
          type: input.type,
          postId: input.postId ?? null,
          storyId: input.storyId ?? null,
          conversationId: input.conversationId ?? null,
        },
        select: NOTIFICATION_VIEW_SELECT,
      });
      this.realtime.toUsers(
        [input.recipientId],
        'notification:new',
        toNotificationView(row),
      );
    } catch (error) {
      this.logger.error(
        `No se pudo crear el aviso ${input.type}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async alreadySent(input: NotifyInput): Promise<boolean> {
    const found = await this.prisma.notification.findFirst({
      where: {
        recipientId: input.recipientId,
        actorId: input.actorId,
        type: input.type,
        postId: input.postId ?? null,
        storyId: input.storyId ?? null,
      },
      select: { id: true },
    });
    return found !== null;
  }

  // Ni a uno mismo, ni con un bloqueo entre los dos, ni si el receptor apagó
  // ese tipo.
  private async allowed(input: NotifyInput): Promise<boolean> {
    const preferences = await this.prisma.notificationPreference.findUnique({
      where: { userId: input.recipientId },
      select: {
        reactions: true,
        comments: true,
        follows: true,
        messages: true,
        stories: true,
      },
    });
    if (
      !shouldNotify(input.type, input.recipientId, input.actorId, preferences)
    ) {
      return false;
    }
    if (input.actorId === null) return true;
    const facts = await this.visibility.facts(input.recipientId, input.actorId);
    return facts !== null && facts.ownerActive && !facts.blocked;
  }
}
