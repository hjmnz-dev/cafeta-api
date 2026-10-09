import { IsString, Length } from 'class-validator';

export class DeactivateAccountDto {
  /** La contraseña actual: confirma que quien desactiva es el dueño de la cuenta. */
  @IsString()
  @Length(1, 72)
  password: string;
}
