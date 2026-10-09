export type ReportCell = string | number;

export type ReportKind = 'activity' | 'moderation';

// Un informe ya calculado: lo mismo se muestra en pantalla y se vuelve CSV.
export interface ReportTable {
  kind: ReportKind;
  title: string;
  /** Primer día del rango, YYYY-MM-DD en hora de Santo Domingo. */
  from: string;
  /** Último día del rango, inclusive. */
  to: string;
  columns: string[];
  rows: ReportCell[][];
  /** Ninguna actividad registrada en el rango (HU44, escenario 2). */
  isEmpty: boolean;
}
