import { ApiProperty } from '@nestjs/swagger';

export class BlockStatusViewDto {
  @ApiProperty()
  blocked!: boolean;

  @ApiProperty()
  blockedAt!: Date;
}

export class BlockedUserViewDto {
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

  @ApiProperty()
  blockedAt!: Date;
}

export class BlockedUserPageDto {
  @ApiProperty({ type: [BlockedUserViewDto] })
  items!: BlockedUserViewDto[];

  @ApiProperty({ nullable: true })
  nextCursor!: string | null;
}
