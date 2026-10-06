import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ACTIVE } from '../../common/soft-delete/soft-delete.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { PageQueryDto } from '../posts/dto/page-query.dto.js';
import {
  afterConversation,
  afterMessage,
  CONVERSATION_ORDER,
  CONVERSATION_VIEW_SELECT,
  inboxWhere,
  MESSAGE_ORDER,
  MESSAGE_VIEW_SELECT,
  participantWhere,
} from './conversation-queries.js';
import {
  toConversationPage,
  toConversationView,
  toMessagePage,
} from './conversation-view.mapper.js';
import type {
  ConversationPageDto,
  ConversationViewDto,
} from './dto/conversation-view.dto.js';
import type { MessagePageDto } from './dto/message-view.dto.js';

export interface Participants {
  userAId: string;
  userBId: string;
}

const invalidCursor = () =>
  new BadRequestException({
    message: 'El cursor no corresponde a ningún elemento de esta lista',
    code: 'INVALID_CURSOR',
  });

// Lecturas de mensajería (spec 0008, decisión 25): bandeja, una conversación
// y su historial. Solo las ve quien participa en ellas.
@Injectable()
export class ConversationsReadService {
  constructor(private readonly prisma: PrismaService) {}

  async inbox(
    userId: string,
    { cursor, limit }: PageQueryDto,
  ): Promise<ConversationPageDto> {
    const where = inboxWhere(userId);
    const after = cursor
      ? await this.afterConversationOf(cursor, userId)
      : null;
    const rows = await this.prisma.conversation.findMany({
      where: after ? { AND: [where, after] } : where,
      orderBy: CONVERSATION_ORDER,
      take: limit + 1,
      select: CONVERSATION_VIEW_SELECT,
    });
    return toConversationPage(rows, limit, userId);
  }

  async findOne(id: string, userId: string): Promise<ConversationViewDto> {
    const row = await this.prisma.conversation.findFirst({
      where: { AND: [{ id }, participantWhere(userId)] },
      select: CONVERSATION_VIEW_SELECT,
    });
    if (!row) throw conversationNotFound();
    return toConversationView(row, userId);
  }

  async messages(
    conversationId: string,
    userId: string,
    { cursor, limit }: PageQueryDto,
  ): Promise<MessagePageDto> {
    await this.participantsOf(conversationId, userId);
    const where = { conversationId, ...ACTIVE };
    const after = cursor
      ? await this.afterMessageOf(cursor, conversationId)
      : null;
    const rows = await this.prisma.message.findMany({
      where: after ? { AND: [where, after] } : where,
      orderBy: MESSAGE_ORDER,
      take: limit + 1,
      select: MESSAGE_VIEW_SELECT,
    });
    return toMessagePage(rows, limit);
  }

  // Los dos ids de la conversación, o 404 si no participo o la otra persona
  // ya no está activa. Mismo 404 en los dos casos: no revela si existe.
  async participantsOf(
    conversationId: string,
    userId: string,
  ): Promise<Participants> {
    const row = await this.prisma.conversation.findFirst({
      where: { AND: [{ id: conversationId }, participantWhere(userId)] },
      select: { userAId: true, userBId: true },
    });
    if (!row) throw conversationNotFound();
    return row;
  }

  // Sin el cursor nativo de Prisma, por la misma razón que en publicaciones.
  private async afterConversationOf(cursor: string, userId: string) {
    const row = await this.prisma.conversation.findFirst({
      where: { AND: [{ id: cursor }, inboxWhere(userId)] },
      select: { lastMessageAt: true },
    });
    if (!row?.lastMessageAt) throw invalidCursor();
    return afterConversation(row.lastMessageAt, cursor);
  }

  private async afterMessageOf(cursor: string, conversationId: string) {
    const row = await this.prisma.message.findFirst({
      where: { id: cursor, conversationId },
      select: { createdAt: true },
    });
    if (!row) throw invalidCursor();
    return afterMessage(row.createdAt, cursor);
  }
}

export function conversationNotFound(): NotFoundException {
  return new NotFoundException({
    message: 'La conversación no existe',
    code: 'CONVERSATION_NOT_FOUND',
  });
}
