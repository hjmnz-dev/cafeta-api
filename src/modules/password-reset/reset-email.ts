import type { MailMessage } from '../../common/mail/mailer.js';

/** Dirección del enlace que abre la pantalla de nueva contraseña de la web. */
export function resetLink(webBase: string, token: string): string {
  const base = webBase.replace(/\/+$/, '');
  return `${base}/reset-password?token=${encodeURIComponent(token)}`;
}

/** Correo de recuperación, en español (spec 0008, decisión 10). Función pura. */
export function buildResetEmail(
  to: string,
  link: string,
  minutes: number,
): MailMessage {
  return {
    to,
    subject: 'Restablece tu contraseña de Cafeta',
    text: [
      'Hola,',
      '',
      'Recibimos una solicitud para restablecer la contraseña de tu cuenta de Cafeta.',
      `Abre este enlace en los próximos ${minutes} minutos y elige una contraseña nueva:`,
      '',
      link,
      '',
      'El enlace sirve una sola vez. Al usarlo, se cerrarán todas tus sesiones abiertas.',
      '',
      'Si no fuiste tú, ignora este correo: tu contraseña sigue igual.',
      '',
      'Cafeta, la red social de INTEC',
    ].join('\n'),
  };
}
