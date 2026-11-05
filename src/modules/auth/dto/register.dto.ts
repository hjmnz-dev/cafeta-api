import { Transform } from 'class-transformer';
import {
  Equals,
  IsEmail,
  IsString,
  IsUUID,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const trimLower = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export class RegisterDto {
  /** @example estudiante@est.intec.edu.do */
  @Transform(trimLower)
  @IsEmail({}, { message: 'email debe ser un correo válido' })
  @MaxLength(254)
  email: string;

  /** De 8 a 72 caracteres, con al menos una letra y un número. */
  @IsString()
  @Length(8, 72)
  @Matches(/[A-Za-z]/, { message: 'password debe tener al menos una letra' })
  @Matches(/\d/, { message: 'password debe tener al menos un número' })
  password: string;

  /** @example Carlos */
  @Transform(trim)
  @IsString()
  @Length(1, 30)
  firstName: string;

  /** @example Gómez */
  @Transform(trim)
  @IsString()
  @Length(1, 29)
  lastName: string;

  /** @example cgomez_intec */
  @Transform(trimLower)
  @Matches(/^[a-z0-9._]{3,30}$/, {
    message: 'handle debe tener de 3 a 30 letras, números, punto o guion bajo',
  })
  handle: string;

  @IsUUID()
  careerId: string;

  @Equals(true, { message: 'acceptTerms debe ser true' })
  acceptTerms: boolean;
}
