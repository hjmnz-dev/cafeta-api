// El cliente manda el JWT en el handshake: io(url, { auth: { token } }).
// Función pura para poder probarla sin socket.
export function socketToken(auth: unknown): string | null {
  if (typeof auth !== 'object' || auth === null) return null;
  const token = (auth as Record<string, unknown>).token;
  return typeof token === 'string' && token.length > 0 ? token : null;
}
