import { createTransport, type Transporter } from 'nodemailer';
import { Mailer, type MailMessage } from './mailer.js';

export interface SmtpSettings {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
}

// Gmail con contraseña de aplicación: el puerto 465 usa TLS directo; el 587,
// STARTTLS (nodemailer lo negocia solo cuando secure es false).
export class SmtpMailer extends Mailer {
  private readonly transporter: Transporter;

  constructor(private readonly settings: SmtpSettings) {
    super();
    this.transporter = createTransport({
      host: settings.host,
      port: settings.port,
      secure: settings.port === 465,
      auth: { user: settings.user, pass: settings.pass },
    });
  }

  async send(message: MailMessage): Promise<void> {
    await this.transporter.sendMail({ from: this.settings.from, ...message });
  }
}
