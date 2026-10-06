import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../../common/actor/actor-context.js';
import { CurrentUser } from '../../common/actor/current-user.decorator.js';
import { PageQueryDto } from '../posts/dto/page-query.dto.js';
import { ConversationsReadService } from './conversations-read.service.js';
import { ConversationsService } from './conversations.service.js';
import {
  ConversationPageDto,
  ConversationViewDto,
} from './dto/conversation-view.dto.js';
import { MessagePageDto, MessageViewDto } from './dto/message-view.dto.js';
import { OpenConversationDto } from './dto/open-conversation.dto.js';
import { SendMessageDto } from './dto/send-message.dto.js';

@ApiTags('conversations')
@ApiBearerAuth()
@Controller('conversations')
export class ConversationsController {
  constructor(
    private readonly conversations: ConversationsService,
    private readonly reads: ConversationsReadService,
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
}
