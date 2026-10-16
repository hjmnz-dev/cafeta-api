import { ApiProperty } from '@nestjs/swagger';

export class ConversationUserDto {
  id: string;
  /** @example cgomez_intec */
  handle: string;
  /** @example Carlos Gómez */
  displayName: string;
  /** Su foto de perfil (URL firmada); null si no tiene. */
  @ApiProperty({ type: String, nullable: true })
  avatarUrl: string | null;
  @ApiProperty({
    type: String,
    nullable: true,
    example: 'Ingeniería de Software',
  })
  careerName: string | null;
  /** true si la cuenta está verificada. */
  verified: boolean;
}

export class LastMessageDto {
  id: string;
  senderId: string;
  content: string;
  /** Fecha de envío en ISO 8601. */
  createdAt: string;
}

export class ConversationViewDto {
  id: string;
  /** La otra persona de la conversación. */
  otherUser: ConversationUserDto;
  /** Último mensaje visible; null si todavía no hay mensajes. */
  @ApiProperty({ type: LastMessageDto, nullable: true })
  lastMessage: LastMessageDto | null;
  /** true si el último mensaje es del otro y no lo he leído. */
  unread: boolean;
}

export class ConversationPageDto {
  /** De la actividad más reciente a la más antigua. */
  @ApiProperty({ type: [ConversationViewDto] })
  items: ConversationViewDto[];
  /** id para pedir la página siguiente; null cuando no hay más. */
  @ApiProperty({ type: String, nullable: true })
  nextCursor: string | null;
}
