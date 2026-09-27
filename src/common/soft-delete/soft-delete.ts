import { ConflictException, NotFoundException } from '@nestjs/common';

// Filtros de baja lógica (spec 0003). Toda lectura de entidades con baja
// lógica usa ACTIVE, y las que tienen autor, también ACTIVE_AUTHOR.
export const ACTIVE = { deactivatedAt: null } as const;
export const ACTIVE_AUTHOR = { author: ACTIVE } as const;

export type StateChange = 'deactivate' | 'reactivate';

// Un solo tipo para los dos casos: así Prisma lo acepta en cualquier updateMany.
export interface StateChangeArgs {
  where: { id: string; deactivatedAt: null | { not: null } };
  data: { deactivatedAt: Date | null };
}

// where y data del updateMany condicional: la condición sobre deactivatedAt
// hace que dos peticiones simultáneas no puedan ganar las dos.
export function stateChangeArgs(
  id: string,
  change: StateChange,
  now: Date,
): StateChangeArgs {
  return change === 'deactivate'
    ? { where: { id, deactivatedAt: null }, data: { deactivatedAt: now } }
    : {
        where: { id, deactivatedAt: { not: null } },
        data: { deactivatedAt: null },
      };
}

// Cuando el updateMany no cambió nada: 404 si no existe, 409 si ya estaba así.
export function stateChangeError(
  exists: boolean,
  change: StateChange,
): NotFoundException | ConflictException {
  if (!exists) {
    return new NotFoundException({
      message: 'No existe',
      code: 'NOT_FOUND',
    });
  }
  return change === 'deactivate'
    ? new ConflictException({
        message: 'Ya estaba desactivado',
        code: 'ALREADY_INACTIVE',
      })
    : new ConflictException({
        message: 'Ya estaba activo',
        code: 'ALREADY_ACTIVE',
      });
}
