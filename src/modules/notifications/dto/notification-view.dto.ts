import { ApiProperty } from '@nestjs/swagger';
import { NotificationType } from '../../../generated/prisma/enums.js';

export class NotificationActorDto {
  id: string;
  /** @example cgomez_intec */
  handle: string;
  /** @example Carlos Gómez */
  displayName: string;
  /** Su foto de perfil (URL firmada); null si no tiene. */
  @ApiProperty({ type: String, nullable: true })
  avatarUrl: string | null;
}

export class NotificationViewDto {
  id: string;
  @ApiProperty({ enum: NotificationType, enumName: 'NotificationType' })
  type: NotificationType;
  /** Quien hizo la acción; null en los avisos del sistema. */
  @ApiProperty({ type: NotificationActorDto, nullable: true })
  actor: NotificationActorDto | null;
  @ApiProperty({ type: String, nullable: true })
  postId: string | null;
  @ApiProperty({ type: String, nullable: true })
  storyId: string | null;
  @ApiProperty({ type: String, nullable: true })
  conversationId: string | null;
  /** true si ya se marcó como leída. */
  read: boolean;
  /** Fecha del aviso en ISO 8601. */
  createdAt: string;
}

export class NotificationPageDto {
  /** Del más reciente al más antiguo. */
  @ApiProperty({ type: [NotificationViewDto] })
  items: NotificationViewDto[];
  @ApiProperty({ type: String, nullable: true })
  nextCursor: string | null;
}

export class UnreadCountDto {
  /** Avisos sin leer, para el punto del ícono. */
  count: number;
}
