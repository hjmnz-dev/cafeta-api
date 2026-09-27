import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

// ?cursor=<id>&limit=<n>, la convención de listas de la API.
export class PageQueryDto {
  /** id de la última publicación de la página anterior. */
  @IsOptional()
  @IsUUID()
  cursor?: string;

  /** De 1 a 50; 20 si no se envía. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit: number = 20;
}
