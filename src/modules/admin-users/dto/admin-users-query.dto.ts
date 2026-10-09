import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { PageQueryDto } from '../../posts/dto/page-query.dto.js';

export const USER_STATUSES = ['active', 'inactive'] as const;
export const VERIFICATION_FILTERS = [
  'PENDING',
  'VERIFIED',
  'REJECTED',
] as const;
export const ROLE_FILTERS = ['STUDENT', 'ADMIN'] as const;

// ?search=&status=&verification=&role=&cursor=&limit=. Todos los filtros son
// opcionales y se combinan con "y".
export class AdminUsersQueryDto extends PageQueryDto {
  /** Texto en el correo, el usuario o el nombre; ignora mayúsculas. */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(100)
  search?: string;

  /** `active` (sin baja) o `inactive` (desactivadas). */
  @IsOptional()
  @IsIn(USER_STATUSES)
  status?: (typeof USER_STATUSES)[number];

  @IsOptional()
  @IsIn(VERIFICATION_FILTERS)
  verification?: (typeof VERIFICATION_FILTERS)[number];

  @IsOptional()
  @IsIn(ROLE_FILTERS)
  role?: (typeof ROLE_FILTERS)[number];
}
