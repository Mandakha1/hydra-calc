-- Phase 10.5 — per-project role assignments.
--
-- 3 roles: engineer / checker / approver. Project owner
-- (projects.user_id) is implicitly an engineer; other team members
-- need a row in this table.

CREATE TABLE "project_members" (
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "role" varchar(20) NOT NULL,
  "added_at" timestamptz NOT NULL DEFAULT NOW(),
  "added_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "approved_at" timestamptz,
  PRIMARY KEY ("project_id", "user_id")
);

CREATE INDEX "project_members_project_idx" ON "project_members" ("project_id");
CREATE INDEX "project_members_user_idx" ON "project_members" ("user_id");
