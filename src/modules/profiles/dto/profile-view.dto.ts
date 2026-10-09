import { ApiProperty } from '@nestjs/swagger';
import {
  ProfileVisibility,
  TagCategory,
} from '../../../generated/prisma/enums.js';

export class ProfileTagDto {
  /** @example React */
  label: string;
  @ApiProperty({ enum: TagCategory, enumName: 'TagCategory' })
  category: TagCategory;
}

export class ProfileCountsDto {
  posts: number;
  followers: number;
  following: number;
}

export const FOLLOW_STATES = ['NONE', 'PENDING', 'ACCEPTED'] as const;
export type FollowState = (typeof FOLLOW_STATES)[number];

// El perfil de un usuario visto por quien pregunta. Si no puede ver su
// contenido (decisión 15), llega la versión limitada: sin bio ni etiquetas.
export class ProfileViewDto {
  id: string;
  /** @example cgomez_intec */
  handle: string;
  /** @example Carlos Gómez */
  displayName: string;
  @ApiProperty({
    type: String,
    nullable: true,
    example: 'Ingeniería de Software',
  })
  careerName: string | null;
  @ApiProperty({ type: String, nullable: true })
  careerId: string | null;
  /** Enlace de lectura de la foto (vence en una hora como máximo), o null si no tiene. */
  @ApiProperty({ type: String, nullable: true })
  avatarUrl: string | null;
  /** true si la cuenta está verificada. */
  verified: boolean;
  @ApiProperty({ enum: ProfileVisibility, enumName: 'ProfileVisibility' })
  visibility: ProfileVisibility;
  /** true si es el perfil de quien pregunta. */
  isSelf: boolean;
  /** false en la versión limitada: no se muestran bio, etiquetas ni publicaciones. */
  canSeeContent: boolean;
  /** Seguimiento de quien pregunta hacia este perfil. */
  @ApiProperty({ enum: FOLLOW_STATES, enumName: 'FollowState' })
  followStatus: FollowState;
  /** false en el propio perfil y en los PRIVATE: no se muestra el botón Seguir. */
  canFollow: boolean;
  @ApiProperty({ type: String, nullable: true })
  bio: string | null;
  @ApiProperty({ type: String, nullable: true })
  location: string | null;
  @ApiProperty({ type: [ProfileTagDto] })
  tags: ProfileTagDto[];
  counts: ProfileCountsDto;
}
