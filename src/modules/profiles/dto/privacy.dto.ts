import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { ProfileVisibility } from '../../../generated/prisma/enums.js';

export class PrivacyDto {
  /** PUBLIC: todos ven tu contenido. FOLLOWERS: solo quien te sigue. PRIVATE: solo tú. */
  @ApiProperty({ enum: ProfileVisibility, enumName: 'ProfileVisibility' })
  visibility: ProfileVisibility;
}

export class UpdatePrivacyDto {
  @ApiProperty({ enum: ProfileVisibility, enumName: 'ProfileVisibility' })
  @IsEnum(ProfileVisibility)
  visibility: ProfileVisibility;
}
