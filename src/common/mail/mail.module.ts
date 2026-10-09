import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  NodeEnv,
  type EnvironmentVariables,
} from '../../config/env.validation.js';
import { LogMailer } from './log.mailer.js';
import { Mailer } from './mailer.js';
import { SmtpMailer } from './smtp.mailer.js';

// Elige el proveedor según las variables SMTP_* (spec 0008, decisión 10). Es
// global para que cualquier módulo pida `Mailer` sin importar este.
@Global()
@Module({
  providers: [
    {
      provide: Mailer,
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvironmentVariables, true>) => {
        const host = config.get('SMTP_HOST', { infer: true });
        const user = config.get('SMTP_USER', { infer: true });
        const pass = config.get('SMTP_PASS', { infer: true });
        const from = config.get('MAIL_FROM', { infer: true });
        if (host && user && pass && from) {
          const port = config.get('SMTP_PORT', { infer: true }) ?? 587;
          return new SmtpMailer({ host, port, user, pass, from });
        }
        const production =
          config.get('NODE_ENV', { infer: true }) === NodeEnv.Production;
        return new LogMailer(!production);
      },
    },
  ],
  exports: [Mailer],
})
export class MailModule {}
