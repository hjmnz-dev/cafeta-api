import { ApiProperty } from '@nestjs/swagger';
import { ReactionType } from '../../../generated/prisma/enums.js';

// Cómo queda la historia después de poner o quitar mi reacción.
export class StoryReactionStateDto {
  @ApiProperty({ enum: ReactionType, enumName: 'ReactionType', nullable: true })
  myReaction: ReactionType | null;
  /** Reacciones activas de usuarios activos; solo para el autor, null para los demás. */
  @ApiProperty({ type: Number, nullable: true })
  reactionCount: number | null;
}
