import { Injectable } from '@nestjs/common';

const MAX_PER_WINDOW = 10;
const WINDOW_MS = 60_000;

interface Window {
  start: number;
  count: number;
}

/**
 * Tope de envíos (spec 0007, AC-18): como máximo 10 eventos por clave en cada
 * ventana de 60 segundos. El estado vive en la instancia, nunca en el módulo.
 */
@Injectable()
export class ReportThrottle {
  private readonly windows = new Map<string, Window>();

  allow(key: string, now: number): boolean {
    const current = this.windows.get(key);
    if (!current || now - current.start >= WINDOW_MS) {
      this.windows.set(key, { start: now, count: 1 });
      return true;
    }
    if (current.count >= MAX_PER_WINDOW) return false;
    this.windows.set(key, { start: current.start, count: current.count + 1 });
    return true;
  }
}

/** Clave del tope: el tipo del error más su mensaje. */
export function throttleKey(exception: unknown): string {
  if (exception instanceof Error) {
    return `${exception.name}:${exception.message}`;
  }
  return `NonError:${String(exception)}`;
}
