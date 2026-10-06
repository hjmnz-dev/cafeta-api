import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { RealtimePublisher } from '../realtime/realtime.publisher.js';
import { UsersService } from '../users/users.service.js';
import {
  CONVERSATION_VIEW_SELECT,
  MESSAGE_VIEW_SELECT,
  orderedPair,
} from './conversation-queries.js';
import {
  toConversationView,
  toMessageView,
} from './conversation-view.mapper.js';
import { ConversationsReadService } from './conversations-read.service.js';
import type { ConversationViewDto } from './dto/conversation-view.dto.js';
import type { MessageViewDto } from './dto/message-view.dto.js';
import type { OpenConversationDto } from './dto/open-conversation.dto.js';
import type { SendMessageDto } from './dto/send-message.dto.js';

// Escritura de mensajería (spec 0008, decisión 25). Enviar entra por REST, se
// guarda y después se emite message:new a las salas de los dos participantes.
@Injectable()
export class ConversationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly reads: ConversationsReadService,
    private readonly realtime: RealtimePublisher,
  ) {}

  // Una sola conversación por par: si ya existe, se devuelve la misma.
  // Si hay un bloqueo entre los dos, 404 como si no existiera (decisión 29).
  async open(
    dto: OpenConversationDto,
    userId: string,
  ): Promise<ConversationViewDto> {
    if (dto.userId.toLowerCase() === userId.toLowerCase()) {
      throw new BadRequestException({
        message: 'No puedes escribirte a ti mismo',
        code: 'CANNOT_MESSAGE_SELF',
      });
    }
    if (!(await this.users.isActive(dto.userId))) {
      throw new NotFoundException({
        message: 'El usuario no existe',
        code: 'USER_NOT_FOUND',
      });
    }
    const hasBlock = await this.prisma.block.findFirst({
      where: {
        OR: [
          { blockerId: userId, blockedId: dto.userId },
          { blockerId: dto.userId, blockedId: userId },
        ],
        deactivatedAt: null,
      },
      select: { id: true },
    });
    if (hasBlock) {
      throw new NotFoundException({
        message: 'El usuario no existe',
        code: 'USER_NOT_FOUND',
      });
    }
    const pair = orderedPair(userId, dto.userId);
    const row = await this.prisma.conversation.upsert({
      where: { userAId_userBId: pair },
      create: pair,
      update: {},
      select: CONVERSATION_VIEW_SELECT,
    });
    return toConversationView(row, userId);
  }

  async send(
    conversationId: string,
    dto: SendMessageDto,
    userId: string,
  ): Promise<MessageViewDto> {
    const content = dto.content.trim();
    if (content.length === 0) {
      throw new BadRequestException({
        message: 'El mensaje no puede estar vacío',
        code: 'MESSAGE_CONTENT_REQUIRED',
      });
    }
    const participants = await this.reads.participantsOf(
      conversationId,
      userId,
    );
    const senderIsA = participants.userAId === userId;
    const message = await this.prisma.$transaction(async (tx) => {
      const row = await tx.message.create({
        data: { conversationId, senderId: userId, content },
        select: MESSAGE_VIEW_SELECT,
      });
      // last_message_at es el created_at del mensaje (spec 0002), y quien
      // envía ya leyó hasta su propio mensaje.
      await tx.conversation.update({
        where: { id: conversationId },
        data: {
          lastMessageAt: row.createdAt,
          ...(senderIsA
            ? { userALastReadAt: row.createdAt }
            : { userBLastReadAt: row.createdAt }),
        },
      });
      return row;
    });
    const view = toMessageView(message);
    // TODO(27): NotificationsService.notify({ type: 'MESSAGE', recipientId: <el otro>, actorId: userId })
    this.realtime.toUsers(
      [participants.userAId, participants.userBId],
      'message:new',
      view,
    );
    return view;
  }

  // Marca mi lado como leído hasta ahora (spec 0002: now() al abrirla).
  async markRead(conversationId: string, userId: string): Promise<void> {
    const participants = await this.reads.participantsOf(
      conversationId,
      userId,
    );
    const now = new Date();
    await this.prisma.conversation.update({
      where: { id: conversationId },
      data:
        participants.userAId === userId
          ? { userALastReadAt: now }
          : { userBLastReadAt: now },
    });
  }
}
