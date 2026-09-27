import { ApiProperty } from '@nestjs/swagger';
import { PostType } from '../../../generated/prisma/enums.js';

export class PostAuthorDto {
  id: string;
  /** @example cgomez_intec */
  handle: string;
  /** @example Carlos Gómez */
  displayName: string;
  @ApiProperty({
    type: String,
    nullable: true,
    example: 'Ingeniería de Software',
  })
  careerName: string | null;
  /** true si la cuenta está verificada. */
  verified: boolean;
}

export class PostViewDto {
  id: string;
  @ApiProperty({ enum: PostType, enumName: 'PostType' })
  type: PostType;
  @ApiProperty({ type: String, nullable: true })
  content: string | null;
  @ApiProperty({ type: String, nullable: true, example: 'Biblioteca' })
  location: string | null;
  /** Fecha de creación en ISO 8601. */
  createdAt: string;
  @ApiProperty({ type: String, nullable: true })
  editedAt: string | null;
  @ApiProperty({ type: String, nullable: true })
  eventStartsAt: string | null;
  @ApiProperty({ type: String, nullable: true })
  eventLocation: string | null;
  @ApiProperty({ type: String, nullable: true })
  codeSnippet: string | null;
  @ApiProperty({ type: String, nullable: true })
  groupName: string | null;
  @ApiProperty({ type: Number, nullable: true })
  groupSpots: number | null;
  author: PostAuthorDto;
  reactionCount: number;
  commentCount: number;
}
