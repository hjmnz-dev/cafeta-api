import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import { Prisma } from '../../generated/prisma/client.js';
import type { ActorContext } from '../../common/actor/actor-context.js';
import { AuditService } from '../../common/audit/audit.service.js';
import type { EnvironmentVariables } from '../../config/env.validation.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CareersService } from '../careers/careers.service.js';
import { UsersService } from '../users/users.service.js';
import {
  BCRYPT_COST,
  DUMMY_PASSWORD_HASH,
  TERMS_VERSION,
} from './auth.constants.js';
import { CurrentUserPresenter } from './current-user.presenter.js';
import type {
  AuthResponseDto,
  CurrentUserDto,
} from './dto/auth-response.dto.js';
import type { LoginDto } from './dto/login.dto.js';
import type { RegisterDto } from './dto/register.dto.js';
import { SessionsService, type IssuedSession } from './sessions.service.js';
import type { TokenPayload } from './token-payload.js';

// Reglas de registro, login y cierre de sesión (spec 0004).
@Injectable()
export class AuthService {
  private readonly allowedDomains: readonly string[];

  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly careers: CareersService,
    private readonly sessions: SessionsService,
    private readonly audit: AuditService,
    private readonly jwt: JwtService,
    private readonly presenter: CurrentUserPresenter,
    config: ConfigService<EnvironmentVariables, true>,
  ) {
    this.allowedDomains = config
      .get('ALLOWED_EMAIL_DOMAINS', { infer: true })
      .split(',');
  }

  async register(
    dto: RegisterDto,
    actor: ActorContext,
  ): Promise<AuthResponseDto> {
    const domain = dto.email.split('@')[1] ?? '';
    if (!this.allowedDomains.includes(domain)) {
      throw new BadRequestException({
        message: 'El correo no es institucional',
        code: 'EMAIL_NOT_INSTITUTIONAL',
      });
    }
    if (await this.users.emailExists(dto.email)) throw emailTaken();
    if (await this.users.handleExists(dto.handle)) throw handleTaken();
    if (!(await this.careers.isActive(dto.careerId))) {
      throw new BadRequestException({
        message: 'La carrera no existe',
        code: 'CAREER_NOT_FOUND',
      });
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_COST);
    const now = new Date();
    try {
      const { user, session } = await this.prisma.$transaction(async (tx) => {
        const user = await this.users.createStudent(tx, {
          email: dto.email,
          passwordHash,
          displayName: `${dto.firstName} ${dto.lastName}`,
          handle: dto.handle,
          careerId: dto.careerId,
          termsAcceptedAt: now,
          termsVersion: TERMS_VERSION,
        });
        const session = await this.sessions.create(
          tx,
          {
            userId: user.id,
            remember: false,
            ip: actor.ip,
            userAgent: actor.userAgent,
          },
          now,
        );
        await this.audit.record(tx, {
          action: 'account.register',
          entityType: 'user',
          entityId: user.id,
          actor: { ...actor, userId: user.id, role: user.role },
          succeeded: true,
        });
        return { user, session };
      });
      return this.response(this.presenter.toView(user), session);
    } catch (error) {
      throw uniqueViolation(error) ?? error;
    }
  }

  async login(dto: LoginDto, actor: ActorContext): Promise<AuthResponseDto> {
    const found = await this.users.findByEmailWithHash(dto.email);
    // Siempre se compara, aunque el correo no exista, para tardar lo mismo.
    const valid = await bcrypt.compare(
      dto.password,
      found?.passwordHash ?? DUMMY_PASSWORD_HASH,
    );
    if (!found || !valid) {
      throw new UnauthorizedException({
        message: 'Credenciales incorrectas',
        code: 'INVALID_CREDENTIALS',
      });
    }
    if (found.deactivatedAt) {
      throw new ForbiddenException({
        message: 'La cuenta no está activa',
        code: 'ACCOUNT_INACTIVE',
      });
    }
    const session = await this.sessions.create(
      this.prisma,
      {
        userId: found.id,
        remember: dto.remember ?? false,
        ip: actor.ip,
        userAgent: actor.userAgent,
      },
      new Date(),
    );
    const user = await this.me(found.id);
    return this.response(user, session);
  }

  logout(sessionId: string): Promise<void> {
    return this.sessions.revoke(sessionId, new Date());
  }

  async me(userId: string): Promise<CurrentUserDto> {
    const user = await this.users.findCurrent(userId);
    if (!user) {
      throw new UnauthorizedException({
        message: 'La sesión ya no es válida',
        code: 'SESSION_REVOKED',
      });
    }
    return this.presenter.toView(user);
  }

  private async response(
    user: CurrentUserDto,
    session: IssuedSession,
  ): Promise<AuthResponseDto> {
    const payload: TokenPayload & { exp: number } = {
      sub: user.id,
      jti: session.id,
      role: user.role,
      exp: Math.floor(session.expiresAt.getTime() / 1000),
    };
    return {
      accessToken: await this.jwt.signAsync(payload),
      expiresAt: session.expiresAt.toISOString(),
      user,
    };
  }
}

const emailTaken = () =>
  new ConflictException({
    message: 'La cuenta ya existe',
    code: 'EMAIL_TAKEN',
  });
const handleTaken = () =>
  new ConflictException({
    message: 'El handle ya está en uso',
    code: 'HANDLE_TAKEN',
  });

// Un registro simultáneo con el mismo correo o handle aborta la transacción;
// el campo se lee de error.meta.target, sin volver a consultar (spec 0004).
function uniqueViolation(error: unknown): ConflictException | null {
  if (
    !(error instanceof Prisma.PrismaClientKnownRequestError) ||
    error.code !== 'P2002'
  ) {
    return null;
  }
  const target = JSON.stringify(error.meta ?? {});
  if (target.includes('email')) return emailTaken();
  if (target.includes('handle')) return handleTaken();
  return null;
}
