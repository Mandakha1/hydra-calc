-- Initial schema — Faza 1 (hydra-calc)
-- Generated from src/db/schema.ts via `drizzle-kit generate`.
-- If you modify schema.ts, regenerate via `pnpm --filter backend db:generate`.

CREATE TABLE IF NOT EXISTS "users" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "email" varchar(255) NOT NULL,
  "password_hash" text NOT NULL,
  "name" varchar(120),
  "role" varchar(20) DEFAULT 'user' NOT NULL,
  "verified" boolean DEFAULT false NOT NULL,
  "last_login_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "users_email_idx" ON "users" ("email");

CREATE TABLE IF NOT EXISTS "projects" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "name" varchar(200) NOT NULL,
  "description" text,
  "data" jsonb NOT NULL,
  "schema_version" integer DEFAULT 5 NOT NULL,
  "tags" text[],
  "is_public" boolean DEFAULT false NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "projects_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade
);

CREATE INDEX IF NOT EXISTS "projects_user_idx" ON "projects" ("user_id");
CREATE UNIQUE INDEX IF NOT EXISTS "projects_user_name_idx" ON "projects" ("user_id", "name");
CREATE INDEX IF NOT EXISTS "projects_updated_idx" ON "projects" ("updated_at");

CREATE TABLE IF NOT EXISTS "shares" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL,
  "token" varchar(64) NOT NULL,
  "can_edit" boolean DEFAULT false NOT NULL,
  "expires_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "shares_project_id_projects_id_fk"
    FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE cascade
);

CREATE UNIQUE INDEX IF NOT EXISTS "shares_token_idx" ON "shares" ("token");
CREATE INDEX IF NOT EXISTS "shares_project_idx" ON "shares" ("project_id");

CREATE TABLE IF NOT EXISTS "sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "refresh_token_hash" text NOT NULL,
  "ip" varchar(45),
  "user_agent" text,
  "expires_at" timestamptz NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "revoked_at" timestamptz,
  CONSTRAINT "sessions_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade
);

CREATE INDEX IF NOT EXISTS "sessions_user_idx" ON "sessions" ("user_id");
CREATE INDEX IF NOT EXISTS "sessions_token_hash_idx" ON "sessions" ("refresh_token_hash");
CREATE INDEX IF NOT EXISTS "sessions_expires_idx" ON "sessions" ("expires_at");

CREATE TABLE IF NOT EXISTS "audit_log" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid,
  "action" varchar(60) NOT NULL,
  "details" jsonb,
  "ip" varchar(45),
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "audit_log_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE set null
);

CREATE INDEX IF NOT EXISTS "audit_user_idx" ON "audit_log" ("user_id");
CREATE INDEX IF NOT EXISTS "audit_action_idx" ON "audit_log" ("action");
CREATE INDEX IF NOT EXISTS "audit_created_idx" ON "audit_log" ("created_at");
