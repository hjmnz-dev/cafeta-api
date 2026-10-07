import type { NotificationType } from '../../generated/prisma/client.js';

export type PreferenceKey =
  'reactions' | 'comments' | 'follows' | 'messages' | 'stories';

// Qué interruptor de notification_preferences apaga cada tipo (spec 0002).
// null: el aviso siempre se crea.
const PREFERENCE_OF: Record<NotificationType, PreferenceKey | null> = {
  POST_REACTION: 'reactions',
  POST_COMMENT: 'comments',
  STORY_REACTION: 'stories',
  STORY_COMMENT: 'stories',
  FOLLOW: 'follows',
  FOLLOW_REQUEST: 'follows',
  FOLLOW_ACCEPTED: 'follows',
  MESSAGE: 'messages',
  VERIFICATION_RESULT: null,
};

export function preferenceOf(type: NotificationType): PreferenceKey | null {
  return PREFERENCE_OF[type];
}

// Se crea si el receptor no es quien actúa y no apagó ese tipo. Sin fila de
// preferencias, todo está encendido (el valor por defecto de la tabla).
export function shouldNotify(
  type: NotificationType,
  recipientId: string,
  actorId: string | null,
  preferences: Record<PreferenceKey, boolean> | null,
): boolean {
  if (actorId !== null && actorId === recipientId) return false;
  const key = preferenceOf(type);
  return key === null || preferences === null || preferences[key];
}
