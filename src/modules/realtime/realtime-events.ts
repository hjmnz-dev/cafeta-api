import type { MessageRefDto } from '../conversations/dto/message-ref.dto.js';
import type { MessageViewDto } from '../conversations/dto/message-view.dto.js';
import type { NotificationViewDto } from '../notifications/dto/notification-view.dto.js';

// Eventos que la API emite por el socket (spec 0008, decisión 25). Cada
// funcionalidad suma su evento al final; nunca se renombran, la web los escucha
// por nombre.
export interface ServerEvents {
  'message:new': MessageViewDto;
  'message:updated': MessageViewDto;
  'message:deactivated': MessageRefDto;
  'notification:new': NotificationViewDto;
}

export type ServerEventName = keyof ServerEvents;

// Sala de cada usuario: todas sus pestañas abiertas reciben lo mismo.
export const userRoom = (userId: string): string => `user:${userId}`;
