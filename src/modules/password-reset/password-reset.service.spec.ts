import { BadRequestException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import bcrypt from 'bcryptjs';
import { vi } from 'vitest';
import type { ActorContext } from '../../common/actor/actor-context.js';
import type { AuditService } from '../../common/audit/audit.service.js';
import type { Mailer } from '../../common/mail/mailer.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { SessionsService } from '../auth/sessions.service.js';
import type { CredentialsService } from '../users/credentials.service.js';
import { PasswordResetService } from './password-reset.service.js';
import type { ResetTokensService } from './reset-tokens.service.js';

// Recuperar la contraseña (spec 0008, decisión 10) con dobles por constructor.
const USER_ID = '01926f00-0000-7000-8000-000000000001';
const TOKEN_ID = '01926f00-0000-7000-8000-0000000000aa';
const TX = { marker: 'tx' };

const actor: ActorContext = {
  userId: null,
  role: null,
  ip: '10.0.0.7',
  userAgent: 'vitest',
};

interface Options {
  userId?: string | null;
  usable?: { id: string; userId: string; role: 'STUDENT' } | null;
  consumed?: boolean;
  sendFails?: boolean;
}

function build({
  userId = USER_ID,
  usable = { id: TOKEN_ID, userId: USER_ID, role: 'STUDENT' },
  consumed = true,
  sendFails = false,
}: Options = {}) {
  const prisma = {
    $transaction: vi.fn((work: (tx: unknown) => Promise<void>) => work(TX)),
  };
  const credentials = {
    findActiveIdByEmail: vi.fn().mockResolvedValue(userId),
    setPasswordHash: vi.fn().mockResolvedValue(undefined),
  };
  const tokens = {
    issue: vi.fn().mockResolvedValue('token-en-claro'),
    findUsable: vi.fn().mockResolvedValue(usable),
    consume: vi.fn().mockResolvedValue(consumed),
  };
  const sessions = { revokeAllForUser: vi.fn().mockResolvedValue(undefined) };
  const audit = { record: vi.fn().mockResolvedValue(undefined) };
  const mailer = {
    send: sendFails
      ? vi.fn().mockRejectedValue(new Error('SMTP caído'))
      : vi.fn().mockResolvedValue(undefined),
  };
  const config = {
    get: vi.fn((key: string) =>
      key === 'WEB_URL' ? 'https://cafeta.example' : undefined,
    ),
  };
  const service = new PasswordResetService(
    prisma as unknown as PrismaService,
    credentials as unknown as CredentialsService,
    tokens as unknown as ResetTokensService,
    sessions as unknown as SessionsService,
    audit as unknown as AuditService,
    mailer as unknown as Mailer,
    config as unknown as ConfigService<never, true>,
  );
  return { service, credentials, tokens, sessions, audit, mailer };
}

describe('PasswordResetService.request', () => {
  it('con una cuenta activa emite el token y manda el correo con el enlace', async () => {
    const { service, tokens, mailer } = build();

    await service.request('cgomez@est.intec.edu.do');

    expect(tokens.issue).toHaveBeenCalledWith(USER_ID, expect.any(Date));
    expect(mailer.send).toHaveBeenCalledTimes(1);
    const sent = mailer.send.mock.calls[0]?.[0] as {
      to: string;
      text: string;
    };
    expect(sent.to).toBe('cgomez@est.intec.edu.do');
    expect(sent.text).toContain(
      'https://cafeta.example/reset-password?token=token-en-claro',
    );
  });

  it('con un correo sin cuenta activa no emite ni envía nada y no falla', async () => {
    const { service, tokens, mailer } = build({ userId: null });

    await expect(
      service.request('nadie@est.intec.edu.do'),
    ).resolves.toBeUndefined();

    expect(tokens.issue).not.toHaveBeenCalled();
    expect(mailer.send).not.toHaveBeenCalled();
  });

  it('si el correo no sale, la respuesta es la misma (no se propaga el error)', async () => {
    const { service } = build({ sendFails: true });

    await expect(
      service.request('cgomez@est.intec.edu.do'),
    ).resolves.toBeUndefined();
  });
});

describe('PasswordResetService.reset', () => {
  it('gasta el token, guarda el hash nuevo, cierra las sesiones y audita, en una transacción', async () => {
    const { service, tokens, credentials, sessions, audit } = build();

    await service.reset('token-en-claro', 'clave-nueva-2026', actor);

    expect(tokens.consume).toHaveBeenCalledWith(TX, TOKEN_ID, expect.any(Date));
    const [tx, userId, hash] = credentials.setPasswordHash.mock.calls[0] as [
      unknown,
      string,
      string,
    ];
    expect(tx).toBe(TX);
    expect(userId).toBe(USER_ID);
    expect(hash).not.toBe('clave-nueva-2026');
    expect(await bcrypt.compare('clave-nueva-2026', hash)).toBe(true);
    expect(sessions.revokeAllForUser).toHaveBeenCalledWith(
      TX,
      USER_ID,
      expect.any(Date),
    );
    expect(audit.record).toHaveBeenCalledWith(TX, {
      action: 'account.password_reset',
      entityType: 'user',
      entityId: USER_ID,
      actor: { ...actor, userId: USER_ID, role: 'STUDENT' },
      succeeded: true,
    });
  });

  it('un token vencido, usado o desconocido responde RESET_TOKEN_INVALID sin tocar nada', async () => {
    const { service, credentials, sessions } = build({ usable: null });

    await expect(
      service.reset('malo', 'clave-nueva-2026', actor),
    ).rejects.toMatchObject({
      response: { code: 'RESET_TOKEN_INVALID' },
    });
    expect(credentials.setPasswordHash).not.toHaveBeenCalled();
    expect(sessions.revokeAllForUser).not.toHaveBeenCalled();
  });

  it('si otro uso gana la carrera por el token, falla y no cambia la contraseña', async () => {
    const { service, credentials, audit } = build({ consumed: false });

    await expect(
      service.reset('token-en-claro', 'clave-nueva-2026', actor),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(credentials.setPasswordHash).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });
});
