import {
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../../common/actor/actor-context.js';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator.js';
import { AccessTokenService } from './access-token.service.js';

type AuthRequest = Request & { user?: AuthenticatedUser };

// Guard global (spec 0004): toda ruta exige un JWT con su sesión vigente,
// salvo las marcadas @Public(). El rol sale de la base, no del token.
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: AccessTokenService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<AuthRequest>();
    req.user = await this.tokens.authenticate(
      bearerToken(req.headers.authorization),
    );
    return true;
  }
}

function bearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  return scheme === 'Bearer' && token ? token : null;
}
