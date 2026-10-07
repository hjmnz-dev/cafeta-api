import { ForbiddenException, Injectable } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import type {
  ActorContext,
  AuthenticatedUser,
} from '../../common/actor/actor-context.js';
import { UserAccountService } from '../users/user-account.service.js';
import { AccountStateService } from './account-state.service.js';

// Baja voluntaria de la propia cuenta (HU05, spec 0009 decisión 11): pide la
// contraseña y delega el cambio en AccountStateService.
@Injectable()
export class SelfDeactivationService {
  constructor(
    private readonly users: UserAccountService,
    private readonly state: AccountStateService,
  ) {}

  async deactivate(
    user: AuthenticatedUser,
    password: string,
    actor: ActorContext,
  ): Promise<void> {
    // Un admin no se da de baja por aquí: la consola se quedaría sin acceso.
    if (user.role === 'ADMIN') {
      throw new ForbiddenException({
        message: 'Un administrador no puede desactivar su propia cuenta',
        code: 'ADMIN_CANNOT_SELF_DEACTIVATE',
      });
    }
    const found = await this.users.findHashById(user.id);
    // 403 y no 401: el cliente HTTP toma un 401 como sesión vencida y la cerraría.
    if (!found || !(await bcrypt.compare(password, found.passwordHash))) {
      throw new ForbiddenException({
        message: 'La contraseña no es correcta',
        code: 'INVALID_PASSWORD',
      });
    }
    await this.state.deactivate(user.id, actor, { by: 'self' });
  }
}
