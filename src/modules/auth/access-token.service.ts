import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { AuthenticatedUser } from '../../common/actor/actor-context.js';
import { SessionsService } from './sessions.service.js';
import { isTokenPayload, type TokenPayload } from './token-payload.js';

const unauthorized = () =>
  new UnauthorizedException({
    message: 'Se requiere una sesión',
    code: 'UNAUTHORIZED',
  });

const revoked = () =>
  new UnauthorizedException({
    message: 'La sesión ya no es válida',
    code: 'SESSION_REVOKED',
  });

// Convierte un JWT en el usuario autenticado (spec 0004). Lo usan el guard de
// HTTP y el handshake del socket (spec 0008, decisión 25), así los dos aplican
// la misma regla: token firmado y sesión vigente en sessions.
@Injectable()
export class AccessTokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly sessions: SessionsService,
  ) {}

  async authenticate(token: string | null): Promise<AuthenticatedUser> {
    if (!token) throw unauthorized();
    const payload = await this.verify(token);
    const session = await this.sessions.findValid(payload.jti, new Date());
    if (!session || session.userId !== payload.sub) throw revoked();
    return { id: session.userId, role: session.role, sessionId: session.id };
  }

  private async verify(token: string): Promise<TokenPayload> {
    try {
      const payload: unknown = await this.jwt.verifyAsync(token, {
        algorithms: ['HS256'],
      });
      if (!isTokenPayload(payload)) throw unauthorized();
      return payload;
    } catch {
      throw unauthorized();
    }
  }
}
