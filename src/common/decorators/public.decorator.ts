import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

// Marca una ruta que no exige token. El guard global que la lee llega
// con la funcionalidad 6 (registro, inicio y cierre de sesión).
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
