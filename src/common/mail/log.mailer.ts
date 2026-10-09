import { Logger } from '@nestjs/common';
import { Mailer, type MailMessage } from './mailer.js';

// Sin SMTP configurado (local, pruebas, un entorno nuevo) los correos no salen.
// Con `showBody` (solo fuera de producción) el texto queda en el log, para abrir
// el enlace a mano; en producción el cuerpo nunca se escribe: trae el token.
export class LogMailer extends Mailer {
  private readonly logger = new Logger('Correo');

  constructor(private readonly showBody: boolean) {
    super();
  }

  send(message: MailMessage): Promise<void> {
    this.logger.warn(
      `Correo no enviado (falta SMTP_HOST, SMTP_USER, SMTP_PASS o MAIL_FROM): "${message.subject}"`,
    );
    if (this.showBody) this.logger.log(`Para ${message.to}:\n${message.text}`);
    return Promise.resolve();
  }
}
