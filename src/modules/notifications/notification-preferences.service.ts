import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import type {
  NotificationPreferencesDto,
  UpdateNotificationPreferencesDto,
} from './dto/notification-preferences.dto.js';

const PREFERENCES_SELECT = {
  reactions: true,
  comments: true,
  follows: true,
  messages: true,
  stories: true,
} as const;

// Preferencias de avisos (HU08). La fila nace con el registro; el upsert
// cubre cuentas creadas antes de esa regla.
@Injectable()
export class NotificationPreferencesService {
  constructor(private readonly prisma: PrismaService) {}

  get(userId: string): Promise<NotificationPreferencesDto> {
    return this.prisma.notificationPreference.upsert({
      where: { userId },
      create: { userId },
      update: {},
      select: PREFERENCES_SELECT,
    });
  }

  // Solo cambia los campos que llegan; undefined deja el valor como estaba.
  update(
    userId: string,
    dto: UpdateNotificationPreferencesDto,
  ): Promise<NotificationPreferencesDto> {
    const data = {
      reactions: dto.reactions,
      comments: dto.comments,
      follows: dto.follows,
      messages: dto.messages,
      stories: dto.stories,
    };
    return this.prisma.notificationPreference.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
      select: PREFERENCES_SELECT,
    });
  }
}
