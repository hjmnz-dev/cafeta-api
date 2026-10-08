import { ApiProperty } from '@nestjs/swagger';
import { ReactionType } from '../../../generated/prisma/enums.js';

// Cómo queda la publicación después de poner o quitar mi reacción.
export class ReactionStateDto {
  /** Reacciones activas de usuarios activos. */
  reactionCount: number;
  @ApiProperty({ enum: ReactionType, enumName: 'ReactionType', nullable: true })
  myReaction: ReactionType | null;
}
