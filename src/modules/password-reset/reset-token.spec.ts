import {
  generateResetToken,
  hashToken,
  RESET_TOKEN_TTL_MS,
} from './reset-token.js';

describe('reset-token', () => {
  it('genera un token de 32 bytes apto para una URL y su hash SHA 256', () => {
    const { token, hash } = generateResetToken();

    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).toBe(hashToken(token));
    expect(hash).not.toContain(token);
  });

  it('cada token es distinto', () => {
    expect(generateResetToken().token).not.toBe(generateResetToken().token);
  });

  it('el mismo token siempre da el mismo hash', () => {
    expect(hashToken('abc')).toBe(hashToken('abc'));
    expect(hashToken('abc')).not.toBe(hashToken('abd'));
  });

  it('el enlace dura 30 minutos', () => {
    expect(RESET_TOKEN_TTL_MS).toBe(30 * 60 * 1000);
  });
});
