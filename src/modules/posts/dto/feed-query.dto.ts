import { IsOptional, IsUUID } from 'class-validator';
import { PageQueryDto } from './page-query.dto.js';

export class FeedQueryDto extends PageQueryDto {
  /** Sin careerId es "Para ti"; con él, la pestaña de esa carrera. */
  @IsOptional()
  @IsUUID()
  careerId?: string;
}
