import { ApiProperty } from '@nestjs/swagger';
import { Role } from '../../../generated/prisma/enums.js';

export class AuditActorDto {
  id: string;
  /** @example ana@est.intec.edu.do */
  email: string;
  /** Usuario de su perfil; null si no tiene. */
  @ApiProperty({ type: String, nullable: true })
  handle: string | null;
  /** Rol que tenía al actuar. */
  @ApiProperty({ enum: Role, enumName: 'Role', nullable: true })
  role: Role | null;
}

export class AdminAuditEntryDto {
  id: string;
  /** Cuándo ocurrió, en ISO 8601. */
  createdAt: string;
  /** Quién actuó; null si fue un intento sin sesión. */
  @ApiProperty({ type: AuditActorDto, nullable: true })
  actor: AuditActorDto | null;
  /** @example post.create */
  action: string;
  /** @example post */
  entityType: string;
  @ApiProperty({ type: String, nullable: true })
  entityId: string | null;
  /** false si el intento fue rechazado (por ejemplo `access.denied`). */
  succeeded: boolean;
  /** Datos extra de la acción; su forma depende de la acción. */
  @ApiProperty({ type: 'object', additionalProperties: true, nullable: true })
  metadata: Record<string, unknown> | null;
  @ApiProperty({ type: String, nullable: true })
  ip: string | null;
}

export class AdminAuditPageDto {
  items: AdminAuditEntryDto[];
  /** id para pedir la página siguiente; null si no hay más. */
  @ApiProperty({ type: String, nullable: true })
  nextCursor: string | null;
}

export class AuditActionsDto {
  /** El catálogo de acciones auditables, para llenar un selector. */
  actions: string[];
}
