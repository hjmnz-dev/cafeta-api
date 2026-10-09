import { ApiProperty } from '@nestjs/swagger';
import type { ReportCell, ReportKind } from '../report-table.js';

export class ReportTableDto {
  @ApiProperty({ enum: ['activity', 'moderation'] })
  kind: ReportKind;
  /** Nombre del informe. */
  title: string;
  /** Primer día del rango, YYYY-MM-DD. */
  from: string;
  /** Último día del rango, YYYY-MM-DD, inclusive. */
  to: string;
  /** Encabezados, en el mismo orden que las celdas de cada fila. */
  columns: string[];
  @ApiProperty({
    type: 'array',
    items: {
      type: 'array',
      items: { oneOf: [{ type: 'string' }, { type: 'number' }] },
    },
  })
  rows: ReportCell[][];
  /** No hubo actividad registrada en el rango. */
  isEmpty: boolean;
}
