import { Injectable } from '@nestjs/common';
import type {
  Prisma,
  Role,
  VerificationStatus,
} from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';

export interface NewStudent {
  email: string;
  passwordHash: string;
  displayName: string;
  handle: string;
  careerId: string;
  termsAcceptedAt: Date;
  termsVersion: string;
}

export interface CurrentUser {
  id: string;
  email: string;
  role: Role;
  verificationStatus: VerificationStatus;
  profile: { handle: string; displayName: string; careerId: string | null };
}

export interface UserWithHash {
  id: string;
  role: Role;
  passwordHash: string;
  deactivatedAt: Date | null;
}

const CURRENT_USER_SELECT = {
  id: true,
  email: true,
  role: true,
  verificationStatus: true,
  profile: { select: { handle: true, displayName: true, careerId: true } },
} as const;

type UserWriter = Pick<Prisma.TransactionClient, 'user'>;

// Dueño de users, profiles y notification_preferences (spec 0004).
@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  // El único lugar que lee el hash de la contraseña (para el login).
  findByEmailWithHash(email: string): Promise<UserWithHash | null> {
    return this.prisma.user.findUnique({
      where: { email },
      select: { id: true, role: true, passwordHash: true, deactivatedAt: true },
    });
  }

  async emailExists(email: string): Promise<boolean> {
    return (await this.prisma.user.count({ where: { email } })) > 0;
  }

  async handleExists(handle: string): Promise<boolean> {
    return (await this.prisma.profile.count({ where: { handle } })) > 0;
  }

  async createStudent(tx: UserWriter, data: NewStudent): Promise<CurrentUser> {
    const user = await tx.user.create({
      data: {
        email: data.email,
        passwordHash: data.passwordHash,
        termsAcceptedAt: data.termsAcceptedAt,
        termsVersion: data.termsVersion,
        profile: {
          create: {
            handle: data.handle,
            displayName: data.displayName,
            careerId: data.careerId,
          },
        },
        notificationPreference: { create: {} },
      },
      select: CURRENT_USER_SELECT,
    });
    return toCurrentUser(user);
  }

  async findCurrent(id: string): Promise<CurrentUser | null> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: CURRENT_USER_SELECT,
    });
    return user ? toCurrentUser(user) : null;
  }
}

function toCurrentUser(user: {
  id: string;
  email: string;
  role: Role;
  verificationStatus: VerificationStatus;
  profile: {
    handle: string;
    displayName: string;
    careerId: string | null;
  } | null;
}): CurrentUser {
  if (!user.profile) {
    throw new Error(`El usuario ${user.id} no tiene perfil`);
  }
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    verificationStatus: user.verificationStatus,
    profile: user.profile,
  };
}
