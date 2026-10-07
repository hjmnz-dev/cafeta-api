import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { ReactionType } from '../../../generated/prisma/enums.js';

// Mi reacción a una publicación (spec 0009, decisión 20).
export class SetReactionDto {
  @ApiProperty({ enum: ReactionType, enumName: 'ReactionType' })
  @IsEnum(ReactionType)
  type: ReactionType;
}
