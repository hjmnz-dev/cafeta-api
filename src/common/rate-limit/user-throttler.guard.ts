import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { AuthenticatedUser } from '../actor/actor-context.js';

// Cuenta por usuario y no por IP: en el campus muchos estudiantes comparten la
// misma IP (spec 0005). El guard JWT global corre antes, así que req.user ya
// existe; si faltara, cuenta por IP como el guard base.
@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  protected override async getTracker(
    req: Record<string, unknown>,
  ): Promise<string> {
    const user = req.user as AuthenticatedUser | undefined;
    return user ? `user:${user.id}` : super.getTracker(req);
  }
}
