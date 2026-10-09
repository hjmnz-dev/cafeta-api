export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

// Contrato de envío de correo (spec 0008, decisión 10). Los módulos dependen de
// esta clase abstracta y no de nodemailer: cambiar de proveedor (por ejemplo a
// Azure Communication Services) es escribir otra implementación y cambiar el
// factory de MailModule, sin tocar a quien envía.
export abstract class Mailer {
  abstract send(message: MailMessage): Promise<void>;
}
