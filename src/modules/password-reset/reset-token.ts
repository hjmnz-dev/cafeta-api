import { createHash, randomBytes } from 'node:crypto';

const TOKEN_BYTES = 32;

/** Vigencia del enlace: 30 minutos (spec 0008, decisión 10). */
export const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;

export interface ResetToken {
  /** Lo que viaja en el enlace del correo. Nunca se guarda. */
  token: string;
  /** SHA 256 en hexadecimal (64 caracteres): lo único que se guarda. */
  hash: string;
}

/** SHA 256 en hexadecimal del token recibido. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Token aleatorio de 32 bytes, apto para ir en una URL (43 caracteres). */
export function generateResetToken(): ResetToken {
  const token = randomBytes(TOKEN_BYTES).toString('base64url');
  return { token, hash: hashToken(token) };
}
