import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readAppVersion } from './app-version.js';

describe('readAppVersion', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'cafeta-version-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('devuelve el commit del archivo, sin espacios ni saltos de línea', () => {
    const file = join(dir, 'version.txt');
    writeFileSync(file, '727fb36d0c1e\n');
    expect(readAppVersion(file)).toBe('727fb36d0c1e');
  });

  it('devuelve dev si el archivo no existe', () => {
    expect(readAppVersion(join(dir, 'no-existe.txt'))).toBe('dev');
  });

  it('devuelve dev si el archivo está vacío', () => {
    const file = join(dir, 'version.txt');
    writeFileSync(file, '  \n');
    expect(readAppVersion(file)).toBe('dev');
  });

  it('sin archivo en el repo, la ruta por defecto da dev', () => {
    expect(readAppVersion()).toBe('dev');
  });
});
