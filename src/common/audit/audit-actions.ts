// Catálogo de acciones auditables (spec 0003). Cada funcionalidad puede sumar
// códigos, pero nunca se renombran: la bitácora los guarda como texto.
export const AUDIT_ACTIONS = [
  // Cuenta y admin
  'account.register',
  'account.deactivate',
  'account.reactivate',
  'account.verify',
  'account.reject_verification',
  'profile.update',
  'privacy.update',
  'report.generate',
  // Contenido
  'post.create',
  'post.update',
  'post.archive',
  'post.restore',
  'post.deactivate',
  'post.reactivate',
  'post.delete',
  'story.create',
  'story.update',
  'story.deactivate',
  'post_comment.create',
  'post_comment.update',
  'post_comment.deactivate',
  'story_comment.create',
  'story_comment.update',
  'story_comment.deactivate',
  'message.update',
  'message.deactivate',
  'announcement.create',
  // Social y moderación
  'follow.create',
  'follow.accept',
  'follow.reject',
  'follow.deactivate',
  'block.create',
  'block.deactivate',
  'report.create',
  'report.sanction',
  'report.dismiss',
  // Acceso
  'access.denied',
  // Carreras (las usa el módulo de prueba de las e2e)
  'career.deactivate',
  'career.reactivate',
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

// entity_type: el nombre de la tabla en singular.
export const AUDIT_ENTITY_TYPES = [
  'user',
  'profile',
  'career',
  'post',
  'post_comment',
  'story',
  'story_comment',
  'message',
  'follow',
  'block',
  'report',
  'route',
] as const;

export type AuditEntityType = (typeof AUDIT_ENTITY_TYPES)[number];
