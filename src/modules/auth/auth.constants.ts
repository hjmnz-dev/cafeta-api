// Versión de los términos aceptados al registrarse. Es la misma cadena que
// muestra la web en `lib/legal.ts`; al cambiar los textos se cambian las dos
// (spec 0009, decisión 12).
export const TERMS_VERSION = '2026-10';

export const BCRYPT_COST = 12;

// Hash de una contraseña aleatoria que nadie conoce: el login lo compara cuando
// el correo no existe, para tardar lo mismo que con una contraseña incorrecta.
export const DUMMY_PASSWORD_HASH =
  '$2b$12$j4mS5Hw9fifXnnLbd3SFV.5QCvUPaa/cDAwgZrJ1vJjpEd.HlyviW';
