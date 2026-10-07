import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { PageQueryDto } from '../posts/dto/page-query.dto.js';
import {
  afterNotification,
  inboxWhere,
  NOTIFICATION_ORDER,
  NOTIFICATION_VIEW_SELECT,
} from './notification-queries.js';
import { toNotificationPage } from './notification-view.mapper.js';
import type {
  NotificationPageDto,
  UnreadCountDto,
} from './dto/notification-view.dto.js';

// Lista de avisos, su conteo y marcarlos como leídos (HU39). Cada quien solo
// toca los suyos.
@Injectable()
export class NotificationsReadService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    userId: string,
    { cursor, limit }: PageQueryDto,
  ): Promise<NotificationPageDto> {
    const where = inboxWhere(userId);
    const after = cursor ? await this.afterOf(cursor, userId) : null;
    const rows = await this.prisma.notification.findMany({
      where: after ? { AND: [where, after] } : where,
      orderBy: NOTIFICATION_ORDER,
      take: limit + 1,
      select: NOTIFICATION_VIEW_SELECT,
    });
    return toNotificationPage(rows, limit);
  }

  async unreadCount(userId: string): Promise<UnreadCountDto> {
    const count = await this.prisma.notification.count({
      where: { AND: [inboxWhere(userId), { readAt: null }] },
    });
    return { count };
  }

  // Marcar una que ya estaba leída no cambia nada y no es error.
  async markRead(id: string, userId: string): Promise<void> {
    const { count } = await this.prisma.notification.updateMany({
      where: { AND: [{ id }, inboxWhere(userId), { readAt: null }] },
      data: { readAt: new Date() },
    });
    if (count > 0) return;
    const exists = await this.prisma.notification.count({
      where: { AND: [{ id }, inboxWhere(userId)] },
    });
    if (exists === 0) {
      throw new NotFoundException({
        message: 'La notificación no existe',
        code: 'NOTIFICATION_NOT_FOUND',
      });
    }
  }

  async markAllRead(userId: string): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { AND: [inboxWhere(userId), { readAt: null }] },
      data: { readAt: new Date() },
    });
  }

  private async afterOf(cursor: string, userId: string) {
    const row = await this.prisma.notification.findFirst({
      where: { AND: [{ id: cursor }, inboxWhere(userId)] },
      select: { createdAt: true },
    });
    if (!row) {
      throw new BadRequestException({
        message: 'El cursor no corresponde a ningún elemento de esta lista',
        code: 'INVALID_CURSOR',
      });
    }
    return afterNotification(row.createdAt, cursor);
  }
}
