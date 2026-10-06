import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Actor } from '../../common/actor/actor.decorator.js';
import type {
  ActorContext,
  AuthenticatedUser,
} from '../../common/actor/actor-context.js';
import { CurrentUser } from '../../common/actor/current-user.decorator.js';
import { PageQueryDto } from '../posts/dto/page-query.dto.js';
import { ConversationsReadService } from './conversations-read.service.js';
import { ConversationsService } from './conversations.service.js';
import { EditMessageDto } from './dto/edit-message.dto.js';
import {
  ConversationPageDto,
  ConversationViewDto,
} from './dto/conversation-view.dto.js';
import { MessagePageDto, MessageViewDto } from './dto/message-view.dto.js';
import { OpenConversationDto } from './dto/open-conversation.dto.js';
import { SendMessageDto } from './dto/send-message.dto.js';
import { MessageEditsService } from './message-edits.service.js';

@ApiTags('conversations')
@ApiBearerAuth()
@Controller('conversations')
export class ConversationsController {
  constructor(
    private readonly conversations: ConversationsService,
    private readonly reads: ConversationsReadService,
    private readonly edits: MessageEditsService,
  ) {}

  @Get()
  inbox(
    @Query() query: PageQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ConversationPageDto> {
    return this.reads.inbox(user.id, query);
  }

  /** Crea la conversación con esa persona, o devuelve la que ya existe. */
  @Post()
  @HttpCode(200)
  open(
    @Body() dto: OpenConversationDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ConversationViewDto> {
    return this.conversations.open(dto, user.id);
  }

  @Get(':id')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ConversationViewDto> {
    return this.reads.findOne(id, user.id);
  }

  @Get(':id/messages')
  messages(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: PageQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<MessagePageDto> {
    return this.reads.messages(id, user.id, query);
  }

  @Post(':id/messages')
  send(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SendMessageDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<MessageViewDto> {
    return this.conversations.send(id, dto, user.id);
  }

  @Post(':id/read')
  @HttpCode(204)
  markRead(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    return this.conversations.markRead(id, user.id);
  }

  /** Corrige un mensaje propio; queda marcado como editado. */
  @Patch(':id/messages/:messageId')
  edit(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('messageId', ParseUUIDPipe) messageId: string,
    @Body() dto: EditMessageDto,
    @CurrentUser() user: AuthenticatedUser,
    @Actor() actor: ActorContext,
  ): Promise<MessageViewDto> {
    return this.edits.edit(id, messageId, dto, user.id, actor);
  }

  /** Retira un mensaje propio (baja lógica: se conserva para auditoría). */
  @Post(':id/messages/:messageId/deactivate')
  @HttpCode(204)
  deactivate(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('messageId', ParseUUIDPipe) messageId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Actor() actor: ActorContext,
  ): Promise<void> {
    return this.edits.deactivate(id, messageId, user.id, actor);
  }
}
