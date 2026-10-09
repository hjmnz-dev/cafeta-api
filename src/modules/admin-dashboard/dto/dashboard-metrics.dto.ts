export class CountWithRecentDto {
  /** Total vigente. */
  total: number;
  /** Cuántos nacieron en los últimos 7 días. */
  last7Days: number;
}

export class DashboardMetricsDto {
  /** Momento del cálculo, en ISO 8601. Las cifras no se guardan en caché. */
  generatedAt: string;
  /** Estudiantes con la cuenta activa (los admins no cuentan). */
  users: CountWithRecentDto;
  /** Publicaciones visibles: ni desactivadas ni archivadas. */
  posts: CountWithRecentDto;
  /** Historias vigentes: sin vencer y sin desactivar. */
  activeStories: number;
  /** Reportes en espera de revisión. */
  pendingReports: number;
  /** Cuentas de estudiantes activas que aún no se verifican. */
  pendingVerifications: number;
}
