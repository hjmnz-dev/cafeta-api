import { Injectable } from '@nestjs/common';
import type { Prisma, TagCategory } from '../../generated/prisma/client.js';

export interface ProfileChanges {
  displayName?: string;
  bio?: string | null;
  careerId?: string;
  location?: string | null;
  avatarKey?: string | null;
  tags?: { label: string; category: TagCategory }[];
}

type ProfileTx = Pick<Prisma.TransactionClient, 'profile' | 'profileTag'>;

// Escribe el perfil propio (funcionalidad 14). Devuelve la foto anterior para
// que quien llama la borre de Blob si cambió.
@Injectable()
export class ProfileUpdater {
  async apply(
    tx: ProfileTx,
    userId: string,
    { tags, ...fields }: ProfileChanges,
  ): Promise<{ previousAvatarKey: string | null }> {
    const before = await tx.profile.findUniqueOrThrow({
      where: { userId },
      select: { avatarKey: true },
    });
    await tx.profile.update({ where: { userId }, data: fields });
    if (tags) {
      await tx.profileTag.deleteMany({ where: { profileId: userId } });
      await tx.profileTag.createMany({
        data: tags.map((tag, position) => ({
          profileId: userId,
          label: tag.label,
          category: tag.category,
          position,
        })),
      });
    }
    return { previousAvatarKey: before.avatarKey };
  }
}
