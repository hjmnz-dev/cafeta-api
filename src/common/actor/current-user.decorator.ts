import {
  createParamDecorator,
  UnauthorizedException,
  type ExecutionContext,
} from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedUser } from './actor-context.js';

// @CurrentUser() entrega el usuario que dejó el guard JWT (spec 0004). Solo
// tiene sentido en rutas protegidas; en una pública responde 401.
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const req = ctx
      .switchToHttp()
      .getRequest<Request & { user?: AuthenticatedUser }>();
    if (!req.user) {
      throw new UnauthorizedException({
        message: 'Se requiere una sesión',
        code: 'UNAUTHORIZED',
      });
    }
    return req.user;
  },
);
