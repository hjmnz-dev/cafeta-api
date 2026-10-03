export class HealthDto {
  /** @example ok */
  status: 'ok';
  /** @example up */
  db: 'up';
  /** Commit desplegado, o `dev` fuera de producción. @example 727fb36d0c1e9a4b5f2d8e3c6a7b1f0e9d8c7b6a */
  version: string;
}
