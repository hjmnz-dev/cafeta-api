import {
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../../common/actor/actor-context.js';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator.js';
import { SessionsService } from './sessions.service.js';
import { isTokenPayload } from './token-payload.js';

type AuthRequest = Request & { user?: AuthenticatedUser };

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

// Guard global (spec 0004): toda ruta exige un JWT con su sesión vigente,
// salvo las marcadas @Public(). El rol sale de la base, no del token.
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly sessions: SessionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<AuthRequest>();
    const token = bearerToken(req.headers.authorization);
    if (!token) throw unauthorized();

    const payload = await this.verify(token);
    const session = await this.sessions.findValid(payload.jti, new Date());
    if (!session || session.userId !== payload.sub) throw revoked();

    req.user = {
      id: session.userId,
      role: session.role,
      sessionId: session.id,
    };
    return true;
  }

  private async verify(token: string) {
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

function bearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  return scheme === 'Bearer' && token ? token : null;
}
