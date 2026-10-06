import {
  MEDIA_FORMATS,
  MEDIA_KEY_PATTERN,
  sniffMediaFormat,
} from './media-formats.js';

// El tipo sale de los primeros bytes (spec 0008, decisión 13), no del nombre.
const bytes = (...parts: (number[] | string)[]) =>
  new Uint8Array(
    parts.flatMap((p) =>
      typeof p === 'string' ? [...p].map((c) => c.charCodeAt(0)) : p,
    ),
  );

describe('sniffMediaFormat', () => {
  it.each([
    ['JPEG', bytes([0xff, 0xd8, 0xff, 0xe0]), MEDIA_FORMATS.jpeg],
    [
      'PNG',
      bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      MEDIA_FORMATS.png,
    ],
    ['GIF', bytes('GIF89a'), MEDIA_FORMATS.gif],
    ['WebP', bytes('RIFF', [0, 0, 0, 0], 'WEBPVP8 '), MEDIA_FORMATS.webp],
    ['MP4', bytes([0, 0, 0, 0x18], 'ftypisom'), MEDIA_FORMATS.mp4],
    ['WebM', bytes([0x1a, 0x45, 0xdf, 0xa3, 0x01]), MEDIA_FORMATS.webm],
    ['PDF', bytes('%PDF-1.7'), MEDIA_FORMATS.pdf],
  ])('reconoce %s', (_name, data, format) => {
    expect(sniffMediaFormat(data)).toBe(format);
  });

  it.each([
    ['texto con extensión .jpg', bytes('hola mundo')],
    ['HEIC (ftyp heic)', bytes([0, 0, 0, 0x18], 'ftypheic')],
    ['QuickTime (ftyp qt)', bytes([0, 0, 0, 0x14], 'ftypqt  ')],
    ['un ejecutable', bytes('MZ', [0x90, 0])],
    ['vacío', new Uint8Array()],
  ])('rechaza %s', (_name, data) => {
    expect(sniffMediaFormat(data)).toBeNull();
  });
});

describe('MEDIA_KEY_PATTERN', () => {
  it('acepta solo claves <tipo>/<uuid v4>.<ext>', () => {
    expect(
      MEDIA_KEY_PATTERN.test('image/0192f0c4-7d1a-4c3e-9a51-3c2b8e1f4a10.jpg'),
    ).toBe(true);
    expect(MEDIA_KEY_PATTERN.test('../secreto.jpg')).toBe(false);
    expect(
      MEDIA_KEY_PATTERN.test('image/0192f0c4-7d1a-4c3e-9a51-3c2b8e1f4a10.exe'),
    ).toBe(false);
  });
});
