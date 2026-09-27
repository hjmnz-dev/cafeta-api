import { ApiProperty } from '@nestjs/swagger';

export class ProfileSummaryDto {
  /** @example cgomez_intec */
  handle: string;
  /** @example Carlos Gómez */
  displayName: string;
  @ApiProperty({ type: String, nullable: true })
  careerId: string | null;
}

export class CurrentUserDto {
  id: string;
  /** @example 1113672@est.intec.edu.do */
  email: string;
  @ApiProperty({ enum: ['STUDENT', 'ADMIN'] })
  role: 'STUDENT' | 'ADMIN';
  @ApiProperty({ enum: ['PENDING', 'VERIFIED', 'REJECTED'] })
  verificationStatus: 'PENDING' | 'VERIFIED' | 'REJECTED';
  profile: ProfileSummaryDto;
}

export class AuthResponseDto {
  /** JWT para el encabezado Authorization: Bearer. */
  accessToken: string;
  /** Vencimiento de la sesión en ISO 8601. */
  expiresAt: string;
  user: CurrentUserDto;
}
