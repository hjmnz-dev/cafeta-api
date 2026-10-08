import { ApiProperty } from '@nestjs/swagger';
import { Role, VerificationStatus } from '../../../generated/prisma/enums.js';

export class AdminUserViewDto {
  id: string;
  /** @example ana@est.intec.edu.do */
  email: string;
  /** @example ana_intec */
  handle: string;
  /** @example Ana Pérez */
  displayName: string;
  /** Nombre de la carrera; null si no tiene. */
  @ApiProperty({ type: String, nullable: true })
  career: string | null;
  @ApiProperty({ enum: Role, enumName: 'Role' })
  role: Role;
  /** false si la cuenta está desactivada. */
  active: boolean;
  /** Cuándo se desactivó, en ISO 8601; null si está activa. */
  @ApiProperty({ type: String, nullable: true })
  deactivatedAt: string | null;
  @ApiProperty({ enum: VerificationStatus, enumName: 'VerificationStatus' })
  verificationStatus: VerificationStatus;
  /** Fecha de registro en ISO 8601. */
  createdAt: string;
}

export class AdminUserPageDto {
  items: AdminUserViewDto[];
  /** id para pedir la página siguiente; null si no hay más. */
  @ApiProperty({ type: String, nullable: true })
  nextCursor: string | null;
}
