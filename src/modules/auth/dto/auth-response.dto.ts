import { ApiProperty } from '@nestjs/swagger';

export class ProfileSummaryDto {
  /** @example cgomez_intec */
  handle: string;
  /** @example Carlos Gómez */
  displayName: string;
  @ApiProperty({ type: String, nullable: true })
  careerId: string | null;
  /** Mi foto de perfil (URL firmada); null si no tengo. */
  @ApiProperty({ type: String, nullable: true })
  avatarUrl: string | null;
}

export class CurrentUserDto {
  id: string;
  /** @example estudiante@est.intec.edu.do */
  email: string;
  @ApiProperty({ enum: ['STUDENT', 'ADMIN'] })
  role: 'STUDENT' | 'ADMIN';
  @ApiProperty({ enum: ['PENDING', 'VERIFIED', 'REJECTED'] })
  verificationStatus: 'PENDING' | 'VERIFIED' | 'REJECTED';
  /** Fecha de registro. @example 2026-10-02T14:00:00.000Z */
  createdAt: string;
  profile: ProfileSummaryDto;
}

export class AuthResponseDto {
  /** JWT para el encabezado Authorization: Bearer. */
  accessToken: string;
  /** Vencimiento de la sesión en ISO 8601. */
  expiresAt: string;
  user: CurrentUserDto;
}
