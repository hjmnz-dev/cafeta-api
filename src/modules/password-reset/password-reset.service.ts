import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import bcrypt from 'bcryptjs';
import type { ActorContext } from '../../common/actor/actor-context.js';
import { AuditService } from '../../common/audit/audit.service.js';
import { Mailer } from '../../common/mail/mailer.js';
import type { EnvironmentVariables } from '../../config/env.validation.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { BCRYPT_COST } from '../auth/auth.constants.js';
import { SessionsService } from '../auth/sessions.service.js';
import { CredentialsService } from '../users/credentials.service.js';
import { buildResetEmail, resetLink } from './reset-email.js';
import { ResetTokensService } from './reset-tokens.service.js';
import { RESET_TOKEN_TTL_MS } from './reset-token.js';

const invalidToken = () =>
  new BadRequestException({
    message: 'El enlace venció o ya se usó',
    code: 'RESET_TOKEN_INVALID',
  });

// Recuperar la contraseña por correo (spec 0008, decisión 10).
@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);
  private readonly webBase: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly credentials: CredentialsService,
    private readonly tokens: ResetTokensService,
    private readonly sessions: SessionsService,
    private readonly audit: AuditService,
    private readonly mailer: Mailer,
    config: ConfigService<EnvironmentVariables, true>,
  ) {
    this.webBase =
      config.get('WEB_URL', { infer: true }) ??
      config.get('WEB_ORIGIN', { infer: true });
  }

  // La respuesta es la misma exista o no el correo: no se revela quién tiene cuenta.
  // El correo no se espera, así tampoco se nota en el tiempo de respuesta.
  async request(email: string): Promise<void> {
    const userId = await this.credentials.findActiveIdByEmail(email);
    if (!userId) return;
    const token = await this.tokens.issue(userId, new Date());
    const minutes = RESET_TOKEN_TTL_MS / 60_000;
    const message = buildResetEmail(
      email,
      resetLink(this.webBase, token),
      minutes,
    );
    void this.mailer.send(message).catch((error: unknown) => {
      this.logger.error(
        `No se pudo enviar el correo de recuperación: ${error instanceof Error ? error.message : String(error)}`,
      );
    });
  }

  // Cambia la contraseña, gasta el token y cierra todas las sesiones, en una sola
  // transacción: si algo falla, el enlace sigue sirviendo.
  async reset(
    token: string,
    password: string,
    actor: ActorContext,
  ): Promise<void> {
    const now = new Date();
    const usable = await this.tokens.findUsable(token, now);
    if (!usable) throw invalidToken();

    const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
    await this.prisma.$transaction(async (tx) => {
      if (!(await this.tokens.consume(tx, usable.id, now))) {
        throw invalidToken();
      }
      await this.credentials.setPasswordHash(tx, usable.userId, passwordHash);
      await this.sessions.revokeAllForUser(tx, usable.userId, now);
      await this.audit.record(tx, {
        action: 'account.password_reset',
        entityType: 'user',
        entityId: usable.userId,
        actor: { ...actor, userId: usable.userId, role: usable.role },
        succeeded: true,
      });
    });
  }
}
