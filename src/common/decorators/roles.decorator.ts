import { SetMetadata } from '@nestjs/common';
import type { Role } from '../../generated/prisma/client.js';

export const ROLES_KEY = 'roles';

// Marca los roles que pueden usar una ruta. Lo lee RolesGuard, que se activa por
// ruta con @UseGuards(RolesGuard), después del guard JWT global (spec 0007).
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
