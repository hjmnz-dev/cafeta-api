import { socketToken } from './socket-token.js';

describe('socketToken', () => {
  it('toma el token de auth del handshake', () => {
    expect(socketToken({ token: 'abc' })).toBe('abc');
  });

  it('devuelve null si falta, está vacío o no es texto', () => {
    expect(socketToken(undefined)).toBeNull();
    expect(socketToken({})).toBeNull();
    expect(socketToken({ token: '' })).toBeNull();
    expect(socketToken({ token: 42 })).toBeNull();
  });
});
