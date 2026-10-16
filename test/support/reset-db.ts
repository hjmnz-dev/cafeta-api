import type { PrismaService } from '../../src/prisma/prisma.service.js';

// Tablas de la app (spec 0002). _prisma_migrations nunca se limpia: borraría el
// historial de migraciones.
const APP_TABLES = [
  'users',
  'profiles',
  'careers',
  'profile_tags',
  'notification_preferences',
  'follows',
  'blocks',
  'posts',
  'post_media',
  'post_reactions',
  'post_comments',
  'saved_posts',
  'stories',
  'story_views',
  'story_reactions',
  'story_comments',
  'conversations',
  'messages',
  'notifications',
  'reports',
  'audit_logs',
  'sessions',
  'password_reset_tokens',
];

// TRUNCATE no dispara los triggers de fila, así que ni la bitácora inmutable ni
// la guardia de borrado real lo bloquean.
export async function resetDb(prisma: PrismaService): Promise<void> {
  await prisma.$executeRawUnsafe(
    `TRUNCATE ${APP_TABLES.map((t) => `"${t}"`).join(', ')} CASCADE`,
  );
}
