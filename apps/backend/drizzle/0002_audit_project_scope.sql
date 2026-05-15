-- Phase 10.4 — extend audit_log with project_id + entity_type/id for
-- the per-project Activity feed. project_id is nullable so global
-- events (login / register / password reset) can still write without
-- a project context.

ALTER TABLE "audit_log"
  ADD COLUMN "project_id" uuid REFERENCES "projects"("id") ON DELETE CASCADE,
  ADD COLUMN "entity_type" varchar(20),
  ADD COLUMN "entity_id" text;

CREATE INDEX "audit_project_created_idx"
  ON "audit_log" ("project_id", "created_at");
