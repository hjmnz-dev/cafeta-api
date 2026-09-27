// Versión de los términos aceptados al registrarse. Provisional hasta que la
// funcionalidad 12 publique los textos (spec 0004).
export const TERMS_VERSION = '2026-09-borrador';

export const BCRYPT_COST = 12;

// Hash de una contraseña aleatoria que nadie conoce: el login lo compara cuando
// el correo no existe, para tardar lo mismo que con una contraseña incorrecta.
export const DUMMY_PASSWORD_HASH =
  '$2b$12$j4mS5Hw9fifXnnLbd3SFV.5QCvUPaa/cDAwgZrJ1vJjpEd.HlyviW';
