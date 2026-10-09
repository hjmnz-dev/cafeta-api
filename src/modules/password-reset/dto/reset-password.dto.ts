import { IsString, Length, Matches } from 'class-validator';

export class ResetPasswordDto {
  /** El token del enlace del correo. */
  @IsString()
  @Length(20, 200)
  token: string;

  /** De 8 a 72 caracteres, con al menos una letra y un número (igual que al registrarse). */
  @IsString()
  @Length(8, 72)
  @Matches(/[A-Za-z]/, { message: 'password debe tener al menos una letra' })
  @Matches(/\d/, { message: 'password debe tener al menos un número' })
  password: string;
}
