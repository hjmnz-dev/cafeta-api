import type { Role } from '../../generated/prisma/client.js';

// Quién hace la petición. El controller lo arma con @Actor() y se lo pasa al
// service, que así nunca toca Request (spec 0003).
export interface ActorContext {
  userId: string | null;
  role: Role | null;
  ip: string | null;
  userAgent: string | null;
}

// Usuario autenticado que deja el guard JWT en req.user (funcionalidad 6).
export interface AuthenticatedUser {
  id: string;
  role: Role;
}
