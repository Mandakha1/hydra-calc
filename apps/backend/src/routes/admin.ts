import type { FastifyInstance } from "fastify";
import { desc, sql } from "drizzle-orm";
import { db, schema } from "../db/client.js";
import { requireAdmin } from "../auth/middleware.js";

export async function adminRoutes(app: FastifyInstance) {
  app.get("/admin/stats", { preHandler: requireAdmin }, async () => {
    const [usersCount] = (await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.users)) as [{ count: number }];
    const [projectsCount] = (await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.projects)) as [{ count: number }];
    const [sessionsActive] = (await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.sessions)
      .where(sql`${schema.sessions.revokedAt} IS NULL AND ${schema.sessions.expiresAt} > now()`)) as [{ count: number }];

    return {
      users: usersCount?.count ?? 0,
      projects: projectsCount?.count ?? 0,
      activeSessions: sessionsActive?.count ?? 0,
    };
  });

  app.get("/admin/users", { preHandler: requireAdmin }, async (req) => {
    const q = (req.query ?? {}) as { limit?: string; offset?: string };
    const limit = Math.min(Math.max(parseInt(q.limit ?? "50", 10) || 50, 1), 200);
    const offset = Math.max(parseInt(q.offset ?? "0", 10) || 0, 0);
    const rows = await db
      .select()
      .from(schema.users)
      .orderBy(desc(schema.users.createdAt))
      .limit(limit)
      .offset(offset);
    return {
      items: rows.map((u) => ({
        id: u.id,
        email: u.email,
        name: u.name,
        role: u.role,
        verified: u.verified,
        lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
        createdAt: u.createdAt.toISOString(),
      })),
      limit,
      offset,
    };
  });

  app.get("/admin/audit", { preHandler: requireAdmin }, async (req) => {
    const q = (req.query ?? {}) as { limit?: string };
    const limit = Math.min(Math.max(parseInt(q.limit ?? "100", 10) || 100, 1), 500);
    const rows = await db
      .select()
      .from(schema.auditLog)
      .orderBy(desc(schema.auditLog.createdAt))
      .limit(limit);
    return {
      items: rows.map((r) => ({
        id: r.id,
        userId: r.userId,
        action: r.action,
        details: r.details,
        ip: r.ip,
        createdAt: r.createdAt.toISOString(),
      })),
    };
  });
}
