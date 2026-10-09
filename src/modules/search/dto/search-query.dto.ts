import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { PageQueryDto } from '../../posts/dto/page-query.dto.js';

// ?q=<texto>&cursor=<id>&limit=<n>. Al menos 2 caracteres, sin contar los
// espacios de los bordes; la búsqueda ignora mayúsculas y acentos.
export class SearchQueryDto extends PageQueryDto {
  /** Texto a buscar, de 2 a 100 caracteres. */
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  q: string;
}
