import { ApiProperty } from '@nestjs/swagger';

export class MessageViewDto {
  id: string;
  conversationId: string;
  /** id de quien lo envió; la web lo compara con el usuario actual. */
  senderId: string;
  /** @example Hola, ¿vas a la clase de mañana? */
  content: string;
  /** Fecha de envío en ISO 8601. */
  createdAt: string;
  @ApiProperty({ type: String, nullable: true })
  editedAt: string | null;
}

export class MessagePageDto {
  /** Del más reciente al más antiguo; la web los invierte para dibujarlos. */
  @ApiProperty({ type: [MessageViewDto] })
  items: MessageViewDto[];
  /** id para pedir mensajes más antiguos; null cuando no hay más. */
  @ApiProperty({ type: String, nullable: true })
  nextCursor: string | null;
}
