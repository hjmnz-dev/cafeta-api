import { IsString, Length } from 'class-validator';

// Cuerpo de toda ruta /admin/.../deactivate y /reactivate: una sanción sin
// motivo no se puede revisar después (spec 0003).
export class AdminReasonDto {
  @IsString()
  @Length(3, 500)
  reason: string;
}
