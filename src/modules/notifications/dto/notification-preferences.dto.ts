import { IsBoolean, IsOptional } from 'class-validator';

// Un interruptor por grupo (HU08). true: llegan los avisos de ese grupo.
export class NotificationPreferencesDto {
  /** Reacciones a mis publicaciones. */
  reactions: boolean;
  /** Comentarios en mis publicaciones. */
  comments: boolean;
  /** Seguidores nuevos, solicitudes y solicitudes aceptadas. */
  follows: boolean;
  /** Mensajes directos. */
  messages: boolean;
  /** Reacciones y comentarios en mis historias. */
  stories: boolean;
}

// Solo cambia los campos que llegan.
export class UpdateNotificationPreferencesDto {
  @IsOptional()
  @IsBoolean()
  reactions?: boolean;
  @IsOptional()
  @IsBoolean()
  comments?: boolean;
  @IsOptional()
  @IsBoolean()
  follows?: boolean;
  @IsOptional()
  @IsBoolean()
  messages?: boolean;
  @IsOptional()
  @IsBoolean()
  stories?: boolean;
}
