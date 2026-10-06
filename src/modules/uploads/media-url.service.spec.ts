import type { MediaStorage } from './media-storage.js';
import { MediaUrlService, sasExpiry } from './media-url.service.js';

describe('sasExpiry', () => {
  const at = (iso: string) => Date.parse(iso);

  it('vence entre 45 y 60 minutos después y no cambia dentro de la ventana', () => {
    const a = sasExpiry(at('2026-10-06T10:00:00Z'));
    const b = sasExpiry(at('2026-10-06T10:14:59Z'));
    expect(a.toISOString()).toBe('2026-10-06T11:00:00.000Z');
    expect(b).toEqual(a);
    expect(sasExpiry(at('2026-10-06T10:15:00Z')).toISOString()).toBe(
      '2026-10-06T11:15:00.000Z',
    );
  });
});

describe('MediaUrlService', () => {
  it('pide al almacenamiento un enlace de lectura para la clave', () => {
    const readUrl = vi.fn().mockReturnValue('https://blob/x?sas');
    const service = new MediaUrlService({
      readUrl,
    } as unknown as MediaStorage);

    expect(
      service.urlFor('image/x.jpg', Date.parse('2026-10-06T10:05:00Z')),
    ).toBe('https://blob/x?sas');
    expect(readUrl).toHaveBeenCalledWith(
      'image/x.jpg',
      new Date('2026-10-06T11:00:00.000Z'),
    );
  });
});
