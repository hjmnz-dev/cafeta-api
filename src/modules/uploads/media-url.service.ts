import { Injectable } from '@nestjs/common';
import { MediaStorage } from './media-storage.js';

// Ventana de 15 minutos: dentro de ella el enlace de una misma clave no cambia,
// así el navegador reusa su caché. Cada enlace dura entre 45 y 60 minutos.
const WINDOW_MS = 15 * 60 * 1000;
const LIFETIME_MS = 60 * 60 * 1000;

export function sasExpiry(now: number): Date {
  return new Date(Math.floor(now / WINDOW_MS) * WINDOW_MS + LIFETIME_MS);
}

// La base guarda claves, nunca URLs: toda respuesta pasa la clave por aquí
// (spec 0008, decisión 13).
@Injectable()
export class MediaUrlService {
  constructor(private readonly storage: MediaStorage) {}

  urlFor(key: string, now: number = Date.now()): string {
    return this.storage.readUrl(key, sasExpiry(now));
  }
}
