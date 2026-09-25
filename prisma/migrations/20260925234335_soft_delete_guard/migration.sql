-- Guardia de borrado real (spec 0003): las tablas con baja lógica no aceptan DELETE directo.
-- La cascada desde "posts" sí pasa: dentro de una acción de llave foránea el trigger
-- corre anidado (pg_trigger_depth() > 1). TRUNCATE no dispara triggers de fila.
CREATE FUNCTION "forbid_hard_delete"() RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF pg_trigger_depth() = 1 THEN
    RAISE EXCEPTION '% usa baja lógica: DELETE no está permitido', TG_TABLE_NAME;
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER "users_no_hard_delete" BEFORE DELETE ON "users" FOR EACH ROW EXECUTE FUNCTION "forbid_hard_delete"();
CREATE TRIGGER "profiles_no_hard_delete" BEFORE DELETE ON "profiles" FOR EACH ROW EXECUTE FUNCTION "forbid_hard_delete"();
CREATE TRIGGER "careers_no_hard_delete" BEFORE DELETE ON "careers" FOR EACH ROW EXECUTE FUNCTION "forbid_hard_delete"();
CREATE TRIGGER "notification_preferences_no_hard_delete" BEFORE DELETE ON "notification_preferences" FOR EACH ROW EXECUTE FUNCTION "forbid_hard_delete"();
CREATE TRIGGER "follows_no_hard_delete" BEFORE DELETE ON "follows" FOR EACH ROW EXECUTE FUNCTION "forbid_hard_delete"();
CREATE TRIGGER "blocks_no_hard_delete" BEFORE DELETE ON "blocks" FOR EACH ROW EXECUTE FUNCTION "forbid_hard_delete"();
CREATE TRIGGER "post_reactions_no_hard_delete" BEFORE DELETE ON "post_reactions" FOR EACH ROW EXECUTE FUNCTION "forbid_hard_delete"();
CREATE TRIGGER "post_comments_no_hard_delete" BEFORE DELETE ON "post_comments" FOR EACH ROW EXECUTE FUNCTION "forbid_hard_delete"();
CREATE TRIGGER "saved_posts_no_hard_delete" BEFORE DELETE ON "saved_posts" FOR EACH ROW EXECUTE FUNCTION "forbid_hard_delete"();
CREATE TRIGGER "stories_no_hard_delete" BEFORE DELETE ON "stories" FOR EACH ROW EXECUTE FUNCTION "forbid_hard_delete"();
CREATE TRIGGER "story_reactions_no_hard_delete" BEFORE DELETE ON "story_reactions" FOR EACH ROW EXECUTE FUNCTION "forbid_hard_delete"();
CREATE TRIGGER "story_comments_no_hard_delete" BEFORE DELETE ON "story_comments" FOR EACH ROW EXECUTE FUNCTION "forbid_hard_delete"();
CREATE TRIGGER "conversations_no_hard_delete" BEFORE DELETE ON "conversations" FOR EACH ROW EXECUTE FUNCTION "forbid_hard_delete"();
CREATE TRIGGER "messages_no_hard_delete" BEFORE DELETE ON "messages" FOR EACH ROW EXECUTE FUNCTION "forbid_hard_delete"();
CREATE TRIGGER "notifications_no_hard_delete" BEFORE DELETE ON "notifications" FOR EACH ROW EXECUTE FUNCTION "forbid_hard_delete"();
CREATE TRIGGER "reports_no_hard_delete" BEFORE DELETE ON "reports" FOR EACH ROW EXECUTE FUNCTION "forbid_hard_delete"();
