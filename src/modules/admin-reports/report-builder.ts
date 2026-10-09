import type { ReportRange } from './report-range.js';
import type { ReportKind, ReportTable } from './report-table.js';

// Cada informe es una clase que sabe armar su tabla; el service solo las
// orquesta (composición, sin herencia).
export interface ReportBuilder {
  readonly kind: ReportKind;
  /** Nombre del informe en la pantalla. */
  readonly title: string;
  build(range: ReportRange): Promise<ReportTable>;
}
