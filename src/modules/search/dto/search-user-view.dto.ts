import { ApiProperty } from '@nestjs/swagger';
import { FollowUserViewDto } from '../../follows/dto/follow-view.dto.js';
import {
  FOLLOW_STATES,
  type FollowState,
} from '../../profiles/dto/profile-view.dto.js';

// Una persona encontrada, con lo que hace falta para su botón Seguir (bug 1015):
// la misma respuesta que da el perfil, para que seguir desde la búsqueda y desde
// el perfil se vea igual.
export class SearchUserViewDto extends FollowUserViewDto {
  /** Seguimiento de quien busca hacia esta persona. */
  @ApiProperty({ enum: FOLLOW_STATES, enumName: 'FollowState' })
  followStatus!: FollowState;

  /** false en los perfiles PRIVATE: no se muestra el botón Seguir. */
  @ApiProperty()
  canFollow!: boolean;
}

export class SearchUserPageDto {
  @ApiProperty({ type: [SearchUserViewDto] })
  items!: SearchUserViewDto[];

  @ApiProperty({ nullable: true })
  nextCursor!: string | null;
}
