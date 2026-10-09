import { BadRequestException, Injectable } from '@nestjs/common';
import type { ActorContext } from '../../common/actor/actor-context.js';
import { AuditService } from '../../common/audit/audit.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CareersService } from '../careers/careers.service.js';
import { formatForMimeType } from '../uploads/media-formats.js';
import { MediaStorage } from '../uploads/media-storage.js';
import { ProfileUpdater } from '../users/profile-updater.service.js';
import type { ProfileViewDto } from './dto/profile-view.dto.js';
import type { UpdateProfileDto } from './dto/update-profile.dto.js';
import { ProfilesService } from './profiles.service.js';

const invalid = (message: string, code: string) =>
  new BadRequestException({ message, code });

// Editar el perfil propio (funcionalidad 14, HU10): nombre, bio, carrera,
// ubicación, foto y etiquetas. La respuesta es el perfil ya actualizado.
@Injectable()
export class ProfileEditService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly updater: ProfileUpdater,
    private readonly careers: CareersService,
    private readonly storage: MediaStorage,
    private readonly audit: AuditService,
    private readonly profiles: ProfilesService,
  ) {}

  async update(
    userId: string,
    dto: UpdateProfileDto,
    actor: ActorContext,
  ): Promise<ProfileViewDto> {
    await this.validate(userId, dto);
    const { previousAvatarKey } = await this.prisma.$transaction(async (tx) => {
      const result = await this.updater.apply(tx, userId, dto);
      await this.audit.record(tx, {
        action: 'profile.update',
        entityType: 'profile',
        entityId: userId,
        actor,
        succeeded: true,
        metadata: { fields: Object.keys(dto) },
      });
      return result;
    });
    if (
      dto.avatarKey !== undefined &&
      previousAvatarKey &&
      previousAvatarKey !== dto.avatarKey
    ) {
      // La foto vieja ya no la usa nadie; si Blob falla, queda huérfana sin afectar al perfil.
      await this.storage.remove(previousAvatarKey).catch(() => undefined);
    }
    return this.profiles.view(userId, userId);
  }

  private async validate(userId: string, dto: UpdateProfileDto): Promise<void> {
    if (dto.careerId && !(await this.careers.isActive(dto.careerId))) {
      throw invalid('Esa carrera no existe', 'CAREER_NOT_FOUND');
    }
    const labels = dto.tags?.map((t) => t.label.toLowerCase()) ?? [];
    if (new Set(labels).size !== labels.length) {
      throw invalid('Hay etiquetas repetidas', 'TAG_DUPLICATED');
    }
    if (dto.avatarKey) await this.checkAvatar(userId, dto.avatarKey);
  }

  // La foto debe existir en Blob, ser una imagen y ser de quien la usa.
  private async checkAvatar(userId: string, key: string): Promise<void> {
    const stored = await this.storage.describe(key);
    const format = stored && formatForMimeType(stored.contentType);
    if (!stored || stored.ownerId !== userId || format?.mediaType !== 'IMAGE') {
      throw invalid(
        'La foto no existe, no es una imagen o no la subiste tú',
        'MEDIA_NOT_FOUND',
      );
    }
  }
}
