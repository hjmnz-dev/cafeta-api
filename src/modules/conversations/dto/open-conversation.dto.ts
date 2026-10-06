import { IsUUID } from 'class-validator';

export class OpenConversationDto {
  /** id de la otra persona. Si ya hay conversación con ella, se reusa. */
  @IsUUID()
  userId: string;
}
