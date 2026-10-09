import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import {
  AUDIT_ACTIONS,
  AUDIT_ENTITY_TYPES,
} from '../../../common/audit/audit-actions.js';
import { PageQueryDto } from '../../posts/dto/page-query.dto.js';

// ?actor=&action=&entityType=&succeeded=&from=&to=&cursor=&limit=. Todos los
// filtros son opcionales y se combinan con "y".
export class AdminAuditQueryDto extends PageQueryDto {
  /** Texto en el correo o el usuario de quien actuó; ignora mayúsculas. */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(100)
  actor?: string;

  /** Una acción del catálogo, por ejemplo `post.create`. */
  @IsOptional()
  @IsIn(AUDIT_ACTIONS)
  action?: (typeof AUDIT_ACTIONS)[number];

  @IsOptional()
  @IsIn(AUDIT_ENTITY_TYPES)
  entityType?: (typeof AUDIT_ENTITY_TYPES)[number];

  /** `true` solo los que se completaron, `false` solo los rechazados. */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  succeeded?: boolean;

  /** Primer día, AAAA-MM-DD en hora de Santo Domingo (inclusivo). */
  @IsOptional()
  @IsString()
  @MaxLength(10)
  from?: string;

  /** Último día, AAAA-MM-DD en hora de Santo Domingo (inclusivo). */
  @IsOptional()
  @IsString()
  @MaxLength(10)
  to?: string;
}
