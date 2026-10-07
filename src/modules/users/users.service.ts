import { Injectable } from '@nestjs/common';
import type {
  Prisma,
  ProfileVisibility,
  Role,
  TagCategory,
  VerificationStatus,
} from '../../generated/prisma/client.js';
import { ACTIVE } from '../../common/soft-delete/soft-delete.js';
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
  /** Fecha de registro en ISO 8601 ("miembro desde" en Configuración). */
  createdAt: string;
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
  createdAt: true,
  profile: { select: { handle: true, displayName: true, careerId: true } },
} as const;

export interface ProfileRecord {
  handle: string;
  displayName: string;
  bio: string | null;
  careerName: string | null;
  verified: boolean;
  tags: { label: string; category: TagCategory }[];
}

type UserWriter = Pick<Prisma.TransactionClient, 'user'>;
type ProfileWriter = Pick<Prisma.TransactionClient, 'profile'>;

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

  // Cuenta que existe y no está desactivada (para abrir una conversación).
  async isActive(id: string): Promise<boolean> {
    return (await this.prisma.user.count({ where: { id, ...ACTIVE } })) > 0;
  }

  async findProfile(userId: string): Promise<ProfileRecord | null> {
    const profile = await this.prisma.profile.findUnique({
      where: { userId },
      select: {
        handle: true,
        displayName: true,
        bio: true,
        career: { select: { name: true } },
        user: { select: { verificationStatus: true } },
        tags: {
          orderBy: { position: 'asc' },
          select: { label: true, category: true },
        },
      },
    });
    if (!profile) return null;
    return {
      handle: profile.handle,
      displayName: profile.displayName,
      bio: profile.bio,
      careerName: profile.career?.name ?? null,
      verified: profile.user.verificationStatus === 'VERIFIED',
      tags: profile.tags,
    };
  }

  async findVisibility(userId: string): Promise<ProfileVisibility> {
    const profile = await this.prisma.profile.findUniqueOrThrow({
      where: { userId },
      select: { visibility: true },
    });
    return profile.visibility;
  }

  // Cambia la privacidad y devuelve la que tenía antes.
  async updateVisibility(
    tx: ProfileWriter,
    userId: string,
    visibility: ProfileVisibility,
  ): Promise<ProfileVisibility> {
    const before = await tx.profile.findUniqueOrThrow({
      where: { userId },
      select: { visibility: true },
    });
    if (before.visibility !== visibility) {
      await tx.profile.update({ where: { userId }, data: { visibility } });
    }
    return before.visibility;
  }
}

function toCurrentUser(user: {
  id: string;
  email: string;
  role: Role;
  verificationStatus: VerificationStatus;
  createdAt: Date;
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
    createdAt: user.createdAt.toISOString(),
    profile: user.profile,
  };
}
