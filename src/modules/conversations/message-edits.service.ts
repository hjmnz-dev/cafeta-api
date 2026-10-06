import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { ActorContext } from '../../common/actor/actor-context.js';
import { AuditService } from '../../common/audit/audit.service.js';
import {
  ACTIVE,
  stateChangeArgs,
  stateChangeError,
} from '../../common/soft-delete/soft-delete.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { RealtimePublisher } from '../realtime/realtime.publisher.js';
import { MESSAGE_VIEW_SELECT } from './conversation-queries.js';
import { toMessageView } from './conversation-view.mapper.js';
import {
  ConversationsReadService,
  type Participants,
} from './conversations-read.service.js';
import type { EditMessageDto } from './dto/edit-message.dto.js';
import type { MessageViewDto } from './dto/message-view.dto.js';

// Editar y desactivar mensajes propios (spec 0008, decisión 26). Solo el autor
// puede; el cambio se audita en la misma transacción y después se emite a las
// salas de los dos participantes, igual que message:new.
@Injectable()
export class MessageEditsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reads: ConversationsReadService,
    private readonly audit: AuditService,
    private readonly realtime: RealtimePublisher,
  ) {}

  async edit(
    conversationId: string,
    messageId: string,
    dto: EditMessageDto,
    userId: string,
    actor: ActorContext,
  ): Promise<MessageViewDto> {
    const content = dto.content.trim();
    if (content.length === 0) {
      throw new BadRequestException({
        message: 'El mensaje no puede estar vacío',
        code: 'MESSAGE_CONTENT_REQUIRED',
      });
    }
    const participants = await this.authorize(
      conversationId,
      messageId,
      userId,
    );
    const message = await this.prisma.$transaction(async (tx) => {
      // La condición sobre deactivatedAt evita editar un mensaje que otra
      // petición acaba de desactivar.
      const { count } = await tx.message.updateMany({
        where: { id: messageId, ...ACTIVE },
        data: { content, editedAt: new Date() },
      });
      if (count === 0) throw messageNotFound();
      await this.audit.record(tx, {
        action: 'message.update',
        entityType: 'message',
        entityId: messageId,
        actor,
        succeeded: true,
      });
      return tx.message.findUniqueOrThrow({
        where: { id: messageId },
        select: MESSAGE_VIEW_SELECT,
      });
    });
    const view = toMessageView(message);
    this.realtime.toUsers(usersOf(participants), 'message:updated', view);
    return view;
  }

  // Baja lógica (spec 0003): el registro queda en la base para auditoría y
  // deja de salir en el historial y en la bandeja.
  async deactivate(
    conversationId: string,
    messageId: string,
    userId: string,
    actor: ActorContext,
  ): Promise<void> {
    const participants = await this.authorize(
      conversationId,
      messageId,
      userId,
      { includeInactive: true },
    );
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.message.updateMany(
        stateChangeArgs(messageId, 'deactivate', new Date()),
      );
      if (count === 0) throw stateChangeError(true, 'deactivate');
      await this.audit.record(tx, {
        action: 'message.deactivate',
        entityType: 'message',
        entityId: messageId,
        actor,
        succeeded: true,
        metadata: { by: 'self' },
      });
    });
    this.realtime.toUsers(usersOf(participants), 'message:deactivated', {
      id: messageId,
      conversationId,
    });
  }

  // 404 si no participo o el mensaje no es de esta conversación; 403 si es
  // de la otra persona.
  private async authorize(
    conversationId: string,
    messageId: string,
    userId: string,
    { includeInactive = false } = {},
  ): Promise<Participants> {
    const participants = await this.reads.participantsOf(
      conversationId,
      userId,
    );
    const message = await this.prisma.message.findFirst({
      where: {
        id: messageId,
        conversationId,
        ...(includeInactive ? {} : ACTIVE),
      },
      select: { senderId: true },
    });
    if (!message) throw messageNotFound();
    if (message.senderId !== userId) {
      throw new ForbiddenException({
        message: 'Solo quien envió el mensaje puede cambiarlo',
        code: 'NOT_MESSAGE_AUTHOR',
      });
    }
    return participants;
  }
}

function usersOf(participants: Participants): string[] {
  return [participants.userAId, participants.userBId];
}

function messageNotFound(): NotFoundException {
  return new NotFoundException({
    message: 'El mensaje no existe',
    code: 'MESSAGE_NOT_FOUND',
  });
}
