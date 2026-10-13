import { ApiProperty } from '@nestjs/swagger';
import { ReactionType } from '../../../generated/prisma/enums.js';
import { FollowUserViewDto } from '../../follows/dto/follow-view.dto.js';

// Quién reaccionó a mi historia y con qué (bug 1018).
export class StoryReactorDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: ReactionType, enumName: 'ReactionType' })
  type!: ReactionType;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty({ type: FollowUserViewDto })
  user!: FollowUserViewDto;
}

export class StoryReactorPageDto {
  @ApiProperty({ type: [StoryReactorDto] })
  items!: StoryReactorDto[];

  @ApiProperty({ nullable: true })
  nextCursor!: string | null;
}
