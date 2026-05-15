/**
 * Phase 10.4 — Audit log API.
 *
 * Two endpoints:
 *   GET /api/projects/:id/audit — list per-project activity (engineer-only)
 *
 * Pagination via `?limit=` (default 100, max 500) and `?since=`
 * (ISO date — only return entries after this timestamp). For a
 * "load more on scroll" UX, the client passes the oldest entry's
 * `createdAt` as the next `before` filter.
 */
import type { FastifyInstance } from "fastify";
import { and, desc, eq, gt, lt } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "../db/client.js";
import { requireAuth } from "../auth/middleware.js";
import { errors } from "../lib/errors.js";

const querySchema = z.object({
  limit: z.coerce.number().int().positive().max(500).optional(),
  since: z.string().datetime().optional(),
  before: z.string().datetime().optional(),
});

export async function auditRoutes(app: FastifyInstance) {
  app.get(
    "/projects/:id/audit",
    { preHandler: requireAuth },
    async (req) => {
      const { id } = req.params as { id: string };
      // Verify project ownership before exposing audit trail.
      const project = await db.query.projects.findFirst({
        where: and(eq(schema.projects.id, id), eq(schema.projects.userId, req.user!.sub)),
      });
      if (!project) throw errors.notFound("Төсөл олдсонгүй");

      const q = querySchema.safeParse(req.query ?? {});
      if (!q.success) throw errors.validation(q.error.flatten());
      const limit = q.data.limit ?? 100;

      // Build the where clause: project_id = id + optional time filters
      const conditions = [eq(schema.auditLog.projectId, id)];
      if (q.data.since) conditions.push(gt(schema.auditLog.createdAt, new Date(q.data.since)));
      if (q.data.before) conditions.push(lt(schema.auditLog.createdAt, new Date(q.data.before)));

      const rows = await db.query.auditLog.findMany({
        where: and(...conditions),
        orderBy: [desc(schema.auditLog.createdAt)],
        limit,
      });

      return {
        entries: rows.map((r) => ({
          id: r.id,
          action: r.action,
          entityType: r.entityType,
          entityId: r.entityId,
          details: r.details,
          userId: r.userId,
          createdAt: r.createdAt.toISOString(),
        })),
        // Engineer-facing hint for next-page query
        hasMore: rows.length === limit,
      };
    },
  );
}
