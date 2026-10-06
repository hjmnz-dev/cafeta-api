import {
  ForbiddenException,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../../common/actor/actor-context.js';
import { ROLES_KEY } from '../../common/decorators/roles.decorator.js';
import type { Role } from '../../generated/prisma/client.js';

// Deja pasar solo a los roles de @Roles(). El 403 lo audita el filtro global
// como access.denied (spec 0003).
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!roles || roles.length === 0) return true;

    const req = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthenticatedUser }>();
    if (req.user && roles.includes(req.user.role)) return true;
    throw new ForbiddenException({
      message: 'No tienes permiso para esta acción',
      code: 'FORBIDDEN',
    });
  }
}
