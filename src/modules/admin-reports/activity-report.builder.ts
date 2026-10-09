import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { ReportBuilder } from './report-builder.js';
import { REPORT_TIME_ZONE, type ReportRange } from './report-range.js';
import type { ReportTable } from './report-table.js';

type Metric = 'users' | 'posts' | 'stories' | 'comments' | 'messages';
const METRICS: readonly Metric[] = [
  'users',
  'posts',
  'stories',
  'comments',
  'messages',
];

interface DayCount {
  day: string;
  metric: Metric;
  total: number;
}

// Informe de Actividad: por día del rango, lo que nació en la plataforma. Cuenta
// lo creado aunque después se haya desactivado, porque mide actividad y no lo
// que sigue visible. Los usuarios son estudiantes (los admins no cuentan).
@Injectable()
export class ActivityReportBuilder implements ReportBuilder {
  readonly kind = 'activity' as const;
  readonly title = 'Informe de actividad';

  constructor(private readonly prisma: PrismaService) {}

  async build(range: ReportRange): Promise<ReportTable> {
    const counts = await this.countByDay(range);
    const byDay = new Map<string, Record<Metric, number>>();
    for (const { day, metric, total } of counts) {
      const row = byDay.get(day) ?? {
        users: 0,
        posts: 0,
        stories: 0,
        comments: 0,
        messages: 0,
      };
      row[metric] = total;
      byDay.set(day, row);
    }

    const rows = range.days.map((day) => {
      const row = byDay.get(day);
      return [day, ...METRICS.map((metric) => row?.[metric] ?? 0)];
    });
    return {
      kind: this.kind,
      title: this.title,
      from: range.from,
      to: range.to,
      columns: [
        'Fecha',
        'Usuarios nuevos',
        'Publicaciones',
        'Historias',
        'Comentarios',
        'Mensajes',
      ],
      rows,
      isEmpty: counts.length === 0,
    };
  }

  private countByDay({ startsAt, endsAt }: ReportRange): Promise<DayCount[]> {
    return this.prisma.$queryRaw<DayCount[]>(Prisma.sql`
      SELECT to_char((created_at AT TIME ZONE ${REPORT_TIME_ZONE})::date, 'YYYY-MM-DD') AS day,
             metric,
             count(*)::int AS total
      FROM (
        SELECT 'users' AS metric, created_at FROM users WHERE role = 'STUDENT'
        UNION ALL SELECT 'posts', created_at FROM posts
        UNION ALL SELECT 'stories', created_at FROM stories
        UNION ALL SELECT 'comments', created_at FROM post_comments
        UNION ALL SELECT 'comments', created_at FROM story_comments
        UNION ALL SELECT 'messages', created_at FROM messages
      ) events
      WHERE created_at >= ${startsAt} AND created_at < ${endsAt}
      GROUP BY 1, 2
    `);
  }
}
