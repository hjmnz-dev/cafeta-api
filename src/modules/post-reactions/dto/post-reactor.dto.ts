import { ApiProperty } from '@nestjs/swagger';
import { ReactionType } from '../../../generated/prisma/enums.js';
import { FollowUserViewDto } from '../../follows/dto/follow-view.dto.js';

// Quién reaccionó a mi publicación y con qué (bug 1076).
export class PostReactorDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: ReactionType, enumName: 'ReactionType' })
  type!: ReactionType;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty({ type: FollowUserViewDto })
  user!: FollowUserViewDto;
}

export class PostReactorPageDto {
  @ApiProperty({ type: [PostReactorDto] })
  items!: PostReactorDto[];

  @ApiProperty({ nullable: true })
  nextCursor!: string | null;
}
