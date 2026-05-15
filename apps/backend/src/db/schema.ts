import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  jsonb,
  boolean,
  integer,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

/* ---------- users ---------- */
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: varchar("email", { length: 255 }).notNull(),
    passwordHash: text("password_hash").notNull(),
    name: varchar("name", { length: 120 }),
    role: varchar("role", { length: 20 }).default("user").notNull(),
    verified: boolean("verified").default(false).notNull(),
    /** Phase 10.1 — email verification token (URL-friendly, single-use).
     *  Null when no pending verification. Cleared on successful verify. */
    emailVerificationToken: text("email_verification_token"),
    /** Phase 10.1 — password reset token (single-use, expiring). */
    passwordResetToken: text("password_reset_token"),
    /** Phase 10.1 — password reset token expiry (UTC). */
    passwordResetExpires: timestamp("password_reset_expires", { withTimezone: true }),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    emailIdx: uniqueIndex("users_email_idx").on(t.email),
  }),
);

/* ---------- projects ---------- */
export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    name: varchar("name", { length: 200 }).notNull(),
    description: text("description"),
    data: jsonb("data").notNull(),
    schemaVersion: integer("schema_version").default(5).notNull(),
    tags: text("tags").array(),
    isPublic: boolean("is_public").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    userIdx: index("projects_user_idx").on(t.userId),
    userNameIdx: uniqueIndex("projects_user_name_idx").on(t.userId, t.name),
    updatedIdx: index("projects_updated_idx").on(t.updatedAt),
  }),
);

/* ---------- shares ---------- */
export const shares = pgTable(
  "shares",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .references(() => projects.id, { onDelete: "cascade" })
      .notNull(),
    token: varchar("token", { length: 64 }).notNull(),
    canEdit: boolean("can_edit").default(false).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    tokenIdx: uniqueIndex("shares_token_idx").on(t.token),
    projectIdx: index("shares_project_idx").on(t.projectId),
  }),
);

/* ---------- sessions ---------- */
export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    refreshTokenHash: text("refresh_token_hash").notNull(),
    ip: varchar("ip", { length: 45 }),
    userAgent: text("user_agent"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => ({
    userIdx: index("sessions_user_idx").on(t.userId),
    tokenHashIdx: index("sessions_token_hash_idx").on(t.refreshTokenHash),
    expiresIdx: index("sessions_expires_idx").on(t.expiresAt),
  }),
);

/* ---------- project_members (Phase 10.5) ---------- */
/**
 * Per-project role assignment. Each row = one user has one role on
 * one project. 3 roles:
 *   - engineer (full edit + share + delete — owner-equivalent)
 *   - checker  (view + run compliance + comment)
 *   - approver (view + approve / reject the project)
 *
 * The project owner (projects.user_id) is implicitly an engineer;
 * they don't need a row in this table. Other team members do.
 */
export const projectMembers = pgTable(
  "project_members",
  {
    projectId: uuid("project_id")
      .references(() => projects.id, { onDelete: "cascade" })
      .notNull(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    role: varchar("role", { length: 20 }).notNull(),
    addedAt: timestamp("added_at", { withTimezone: true }).defaultNow().notNull(),
    addedBy: uuid("added_by").references(() => users.id, { onDelete: "set null" }),
    /** Phase 10.5 — approver-only fields, populated when role=approver
     *  AND the approver has acted on the project. */
    approvedAt: timestamp("approved_at", { withTimezone: true }),
  },
  (t) => ({
    pk: index("project_members_pk").on(t.projectId, t.userId),
    projectIdx: index("project_members_project_idx").on(t.projectId),
    userIdx: index("project_members_user_idx").on(t.userId),
  }),
);

export type ProjectMember = typeof projectMembers.$inferSelect;
export type NewProjectMember = typeof projectMembers.$inferInsert;

/* ---------- audit_log ---------- */
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    /** Phase 10.4 — project_id for the project-scoped Activity feed.
     *  Nullable so global events (login, register, password.reset.*) can
     *  still write without a project context. */
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
    action: varchar("action", { length: 60 }).notNull(),
    /** Phase 10.4 — engineer-friendly entity tag (node / pipe / building / project). */
    entityType: varchar("entity_type", { length: 20 }),
    entityId: text("entity_id"),
    details: jsonb("details"),
    ip: varchar("ip", { length: 45 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    userIdx: index("audit_user_idx").on(t.userId),
    actionIdx: index("audit_action_idx").on(t.action),
    createdIdx: index("audit_created_idx").on(t.createdAt),
    /** Phase 10.4 — per-project activity feed query path. */
    projectCreatedIdx: index("audit_project_created_idx").on(t.projectId, t.createdAt),
  }),
);

/* ---------- relations ---------- */
export const usersRelations = relations(users, ({ many }) => ({
  projects: many(projects),
  sessions: many(sessions),
  auditEntries: many(auditLog),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  owner: one(users, { fields: [projects.userId], references: [users.id] }),
  shares: many(shares),
}));

export const sharesRelations = relations(shares, ({ one }) => ({
  project: one(projects, { fields: [shares.projectId], references: [projects.id] }),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
export type Share = typeof shares.$inferSelect;
export type NewShare = typeof shares.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
export type AuditLogEntry = typeof auditLog.$inferSelect;
