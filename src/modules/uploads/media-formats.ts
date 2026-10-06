import type { MediaType } from '../../generated/prisma/enums.js';

// Formatos permitidos (spec 0008, decisión 13). El tipo se decide por los
// primeros bytes del archivo, nunca por la extensión ni por el Content-Type.
export interface MediaFormat {
  mimeType: string;
  extension: string;
  mediaType: MediaType;
  maxBytes: number;
}

const MB = 1024 * 1024;

export const IMAGE_MAX_BYTES = 5 * MB;
export const VIDEO_MAX_BYTES = 25 * MB;
export const DOCUMENT_MAX_BYTES = 10 * MB;
// El mayor de los tres: el límite que multer aplica antes de leer los bytes.
export const UPLOAD_MAX_BYTES = VIDEO_MAX_BYTES;

const image = (mimeType: string, extension: string): MediaFormat => ({
  mimeType,
  extension,
  mediaType: 'IMAGE',
  maxBytes: IMAGE_MAX_BYTES,
});
const video = (mimeType: string, extension: string): MediaFormat => ({
  mimeType,
  extension,
  mediaType: 'VIDEO',
  maxBytes: VIDEO_MAX_BYTES,
});

export const MEDIA_FORMATS = {
  jpeg: image('image/jpeg', 'jpg'),
  png: image('image/png', 'png'),
  webp: image('image/webp', 'webp'),
  gif: image('image/gif', 'gif'),
  mp4: video('video/mp4', 'mp4'),
  webm: video('video/webm', 'webm'),
  pdf: {
    mimeType: 'application/pdf',
    extension: 'pdf',
    mediaType: 'DOCUMENT',
    maxBytes: DOCUMENT_MAX_BYTES,
  },
} as const satisfies Record<string, MediaFormat>;

export const ALLOWED_FORMATS_TEXT =
  'imágenes JPG, PNG, WebP o GIF (hasta 5 MB), video MP4 o WebM (hasta 25 MB) y PDF (hasta 10 MB)';

// Marcas de "ftyp" que son MP4 de verdad. HEIC, AVIF y QuickTime también usan
// ftyp, pero el navegador no siempre los reproduce: se rechazan.
const MP4_BRANDS = new Set([
  'isom',
  'iso2',
  'iso4',
  'iso5',
  'iso6',
  'mp41',
  'mp42',
  'avc1',
  'M4V ',
  'dash',
  'mmp4',
]);

const startsWith = (data: Uint8Array, bytes: readonly number[], offset = 0) =>
  data.length >= offset + bytes.length &&
  bytes.every((byte, i) => data[offset + i] === byte);

const ascii = (data: Uint8Array, from: number, to: number) =>
  String.fromCharCode(...data.subarray(from, to));

/** Formato que corresponde a un Content-Type guardado, o null. */
export function formatForMimeType(mimeType: string): MediaFormat | null {
  return (
    Object.values(MEDIA_FORMATS).find((f) => f.mimeType === mimeType) ?? null
  );
}

// Clave que genera UploadsService: <tipo>/<uuid v4>.<ext>.
export const MEDIA_KEY_PATTERN =
  /^(image|video|document)\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp|gif|mp4|webm|pdf)$/;

/** Formato del archivo según su firma, o null si no es uno permitido. */
export function sniffMediaFormat(data: Uint8Array): MediaFormat | null {
  if (startsWith(data, [0xff, 0xd8, 0xff])) return MEDIA_FORMATS.jpeg;
  if (startsWith(data, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    return MEDIA_FORMATS.png;
  if (data.length >= 6 && /^GIF8[79]a$/.test(ascii(data, 0, 6)))
    return MEDIA_FORMATS.gif;
  if (
    data.length >= 12 &&
    ascii(data, 0, 4) === 'RIFF' &&
    ascii(data, 8, 12) === 'WEBP'
  )
    return MEDIA_FORMATS.webp;
  if (startsWith(data, [0x1a, 0x45, 0xdf, 0xa3])) return MEDIA_FORMATS.webm;
  if (
    data.length >= 12 &&
    ascii(data, 4, 8) === 'ftyp' &&
    MP4_BRANDS.has(ascii(data, 8, 12))
  )
    return MEDIA_FORMATS.mp4;
  if (data.length >= 5 && ascii(data, 0, 5) === '%PDF-')
    return MEDIA_FORMATS.pdf;
  return null;
}
