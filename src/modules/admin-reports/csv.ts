import type { ReportCell, ReportTable } from './report-table.js';

// UTF-8 con BOM para que Excel muestre bien los acentos (spec 0008, decisión 35).
const BOM = '﻿';
const EOL = '\r\n';

function escape(cell: ReportCell): string {
  const text = String(cell);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function toCsv(table: ReportTable): string {
  const lines = [table.columns, ...table.rows].map((row) =>
    row.map(escape).join(','),
  );
  return BOM + lines.join(EOL) + EOL;
}
