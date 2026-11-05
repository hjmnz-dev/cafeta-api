import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';

export class LoginDto {
  /** @example estudiante@est.intec.edu.do */
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsString()
  @MaxLength(254)
  email: string;

  @IsString()
  @Length(1, 72)
  password: string;

  /** Con true la sesión dura 30 días; sin él, 12 horas. */
  @IsOptional()
  @IsBoolean()
  remember?: boolean;
}
