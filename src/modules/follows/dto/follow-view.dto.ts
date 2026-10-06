import { ApiProperty } from '@nestjs/swagger';

export class FollowStatusViewDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: ['ACCEPTED', 'PENDING'] })
  status!: 'ACCEPTED' | 'PENDING';
}

export class FollowUserViewDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  handle!: string;

  @ApiProperty()
  displayName!: string;

  @ApiProperty({ nullable: true })
  avatarUrl!: string | null;

  @ApiProperty({ nullable: true })
  careerName!: string | null;

  @ApiProperty()
  verified!: boolean;
}

export class FollowUserPageDto {
  @ApiProperty({ type: [FollowUserViewDto] })
  items!: FollowUserViewDto[];

  @ApiProperty({ nullable: true })
  nextCursor!: string | null;
}

export class FollowRequestViewDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty({ type: FollowUserViewDto })
  follower!: FollowUserViewDto;
}

export class FollowRequestPageDto {
  @ApiProperty({ type: [FollowRequestViewDto] })
  items!: FollowRequestViewDto[];

  @ApiProperty({ nullable: true })
  nextCursor!: string | null;
}
