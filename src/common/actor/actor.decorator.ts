import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { ActorContext, AuthenticatedUser } from './actor-context.js';

const USER_AGENT_MAX = 255;

type RequestWithUser = Request & { user?: AuthenticatedUser };

// Arma el ActorContext de una petición. Función pura para poder probarla sin Nest.
export function actorFromRequest(req: RequestWithUser): ActorContext {
  const userAgent = req.headers['user-agent'];
  return {
    userId: req.user?.id ?? null,
    role: req.user?.role ?? null,
    ip: req.ip ?? null,
    userAgent: userAgent ? userAgent.slice(0, USER_AGENT_MAX) : null,
  };
}

// @Actor() en un parámetro del controller entrega quién hace la petición.
export const Actor = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): ActorContext =>
    actorFromRequest(ctx.switchToHttp().getRequest<RequestWithUser>()),
);
