import { toCsv } from './csv.js';
import type { ReportTable } from './report-table.js';

const table: ReportTable = {
  kind: 'moderation',
  title: 'Informe de moderación',
  from: '2026-09-01',
  to: '2026-09-02',
  columns: ['Motivo', 'Creados'],
  rows: [
    ['Suplantación de identidad', 2],
    ['Dijo "hola", y siguió', 0],
  ],
  isEmpty: false,
};

describe('toCsv', () => {
  it('empieza con BOM UTF-8 y conserva los acentos', () => {
    const csv = toCsv(table);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toContain('Suplantación de identidad,2');
    expect(Buffer.from(csv, 'utf-8').subarray(0, 3)).toEqual(
      Buffer.from([0xef, 0xbb, 0xbf]),
    );
  });

  it('separa con CRLF y escapa comillas y comas', () => {
    const lines = toCsv(table).split('\r\n');
    expect(lines[0]).toBe('﻿Motivo,Creados');
    expect(lines[2]).toBe('"Dijo ""hola"", y siguió",0');
    expect(lines.at(-1)).toBe('');
  });
});
