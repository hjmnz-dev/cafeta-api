import { ApiProperty } from '@nestjs/swagger';
import { PostViewDto } from './post-view.dto.js';

export class PostPageDto {
  @ApiProperty({ type: [PostViewDto] })
  items: PostViewDto[];
  /** id para pedir la página siguiente; null cuando no hay más. */
  @ApiProperty({ type: String, nullable: true })
  nextCursor: string | null;
}

export class PostCountDto {
  /** @example 12 */
  count: number;
}
