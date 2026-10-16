import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';
import { PageQueryDto } from './page-query.dto.js';

// ?resources=true deja solo las publicaciones con un PDF: los "Recursos" del
// perfil (bug 1029).
export class AuthorPostsQueryDto extends PageQueryDto {
  /** true: solo publicaciones con un documento adjunto. */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  resources?: boolean;
}
