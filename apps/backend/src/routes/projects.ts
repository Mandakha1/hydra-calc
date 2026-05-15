import type { FastifyInstance } from "fastify";
import { and, desc, eq, sql } from "drizzle-orm";
import {
  projectCreateSchema,
  projectUpdateSchema,
  shareCreateSchema,
  RATE_LIMITS,
} from "shared";
import { db, schema } from "../db/client.js";
import { requireAuth } from "../auth/middleware.js";
import { generateShareToken } from "../auth/jwt.js";
import { errors } from "../lib/errors.js";

function projectSummary(row: schema.Project) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    tags: row.tags ?? [],
    isPublic: row.isPublic,
    schemaVersion: row.schemaVersion,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function projectsRoutes(app: FastifyInstance) {
  /* list — supports ?name= for `storage.set` upsert lookup */
  app.get(
    "/projects",
    { preHandler: requireAuth, config: { rateLimit: RATE_LIMITS.projectsList } },
    async (req) => {
      const q = (req.query ?? {}) as { name?: string; limit?: string; offset?: string };
      const limit = Math.min(Math.max(parseInt(q.limit ?? "50", 10) || 50, 1), 200);
      const offset = Math.max(parseInt(q.offset ?? "0", 10) || 0, 0);

      const where = q.name
        ? and(eq(schema.projects.userId, req.user!.sub), eq(schema.projects.name, q.name))
        : eq(schema.projects.userId, req.user!.sub);

      const items = await db
        .select()
        .from(schema.projects)
        .where(where)
        .orderBy(desc(schema.projects.updatedAt))
        .limit(limit)
        .offset(offset);

      const [{ count }] = (await db
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.projects)
        .where(where)) as [{ count: number }];

      return {
        items: items.map(projectSummary),
        total: count,
        limit,
        offset,
      };
    },
  );

  /* get one — full data */
  app.get(
    "/projects/:id",
    { preHandler: requireAuth },
    async (req) => {
      const { id } = req.params as { id: string };
      const row = await db.query.projects.findFirst({
        where: and(eq(schema.projects.id, id), eq(schema.projects.userId, req.user!.sub)),
      });
      if (!row) throw errors.notFound("Төсөл олдсонгүй");
      return { ...projectSummary(row), data: row.data, userId: row.userId };
    },
  );

  /* create */
  app.post(
    "/projects",
    { preHandler: requireAuth, config: { rateLimit: RATE_LIMITS.projectsWrite } },
    async (req, reply) => {
      const input = projectCreateSchema.safeParse(req.body);
      if (!input.success) throw errors.validation(input.error.flatten());

      try {
        const [created] = await db
          .insert(schema.projects)
          .values({
            userId: req.user!.sub,
            name: input.data.name,
            description: input.data.description ?? null,
            tags: input.data.tags ?? null,
            data: input.data.data,
          })
          .returning();
        if (!created) throw errors.internal();

        await db.insert(schema.auditLog).values({
          userId: req.user!.sub,
          action: "project.create",
          details: { projectId: created.id, name: created.name },
          ip: req.ip,
        });

        reply.code(201);
        return { ...projectSummary(created), data: created.data };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("projects_user_name_idx")) {
          throw errors.conflict("Ийм нэртэй төсөл аль хэдийн байна");
        }
        throw err;
      }
    },
  );

  /* update */
  app.put(
    "/projects/:id",
    { preHandler: requireAuth, config: { rateLimit: RATE_LIMITS.projectsWrite } },
    async (req) => {
      const { id } = req.params as { id: string };
      const input = projectUpdateSchema.safeParse(req.body);
      if (!input.success) throw errors.validation(input.error.flatten());

      const patch: Partial<schema.NewProject> = { updatedAt: new Date() };
      if (input.data.name !== undefined) patch.name = input.data.name;
      if (input.data.description !== undefined) patch.description = input.data.description ?? null;
      if (input.data.tags !== undefined) patch.tags = input.data.tags ?? null;
      if (input.data.data !== undefined) patch.data = input.data.data;
      if (input.data.isPublic !== undefined) patch.isPublic = input.data.isPublic;

      const [updated] = await db
        .update(schema.projects)
        .set(patch)
        .where(and(eq(schema.projects.id, id), eq(schema.projects.userId, req.user!.sub)))
        .returning();
      if (!updated) throw errors.notFound("Төсөл олдсонгүй");

      return { ...projectSummary(updated), data: updated.data };
    },
  );

  /* delete */
  app.delete("/projects/:id", { preHandler: requireAuth }, async (req) => {
    const { id } = req.params as { id: string };
    const [deleted] = await db
      .delete(schema.projects)
      .where(and(eq(schema.projects.id, id), eq(schema.projects.userId, req.user!.sub)))
      .returning();
    if (!deleted) throw errors.notFound("Төсөл олдсонгүй");

    await db.insert(schema.auditLog).values({
      userId: req.user!.sub,
      action: "project.delete",
      details: { projectId: id },
      ip: req.ip,
    });
    return { ok: true };
  });

  /* share — issue read-only (or canEdit) token */
  app.post(
    "/projects/:id/share",
    { preHandler: requireAuth, config: { rateLimit: RATE_LIMITS.share } },
    async (req) => {
      const { id } = req.params as { id: string };
      const input = shareCreateSchema.safeParse(req.body ?? {});
      if (!input.success) throw errors.validation(input.error.flatten());

      const project = await db.query.projects.findFirst({
        where: and(eq(schema.projects.id, id), eq(schema.projects.userId, req.user!.sub)),
      });
      if (!project) throw errors.notFound("Төсөл олдсонгүй");

      const token = generateShareToken();
      const expiresAt = input.data.expiresInSeconds
        ? new Date(Date.now() + input.data.expiresInSeconds * 1000)
        : null;

      await db.insert(schema.shares).values({
        projectId: project.id,
        token,
        canEdit: input.data.canEdit,
        expiresAt,
      });

      return {
        token,
        url: `/shared/${token}`,
        canEdit: input.data.canEdit,
        expiresAt: expiresAt?.toISOString() ?? null,
      };
    },
  );

  /* Phase 10.3 — list all share tokens for a project (engineer-only) */
  app.get(
    "/projects/:id/shares",
    { preHandler: requireAuth },
    async (req) => {
      const { id } = req.params as { id: string };
      const project = await db.query.projects.findFirst({
        where: and(eq(schema.projects.id, id), eq(schema.projects.userId, req.user!.sub)),
      });
      if (!project) throw errors.notFound("Төсөл олдсонгүй");
      const rows = await db.query.shares.findMany({
        where: eq(schema.shares.projectId, project.id),
        orderBy: [desc(schema.shares.createdAt)],
      });
      return {
        shares: rows.map((s) => ({
          id: s.id,
          token: s.token,
          canEdit: s.canEdit,
          expiresAt: s.expiresAt?.toISOString() ?? null,
          createdAt: s.createdAt.toISOString(),
          /** Engineer-facing flag: token still serves traffic? */
          active:
            (!s.expiresAt || s.expiresAt > new Date()),
        })),
      };
    },
  );

  /* Phase 10.3 — revoke a share token (delete row).
   *  Engineer-only — checks project ownership before deletion. */
  app.delete(
    "/projects/:id/shares/:shareId",
    { preHandler: requireAuth },
    async (req) => {
      const { id, shareId } = req.params as { id: string; shareId: string };
      // Verify project ownership first
      const project = await db.query.projects.findFirst({
        where: and(eq(schema.projects.id, id), eq(schema.projects.userId, req.user!.sub)),
      });
      if (!project) throw errors.notFound("Төсөл олдсонгүй");
      // Delete the share row (cascade-safe because the row only carries
      // a project_id FK to projects).
      const result = await db
        .delete(schema.shares)
        .where(and(eq(schema.shares.id, shareId), eq(schema.shares.projectId, project.id)))
        .returning();
      if (result.length === 0) throw errors.notFound("Хуваалцах токен олдсонгүй");
      await db.insert(schema.auditLog).values({
        userId: req.user!.sub,
        action: "share.revoked",
        details: { projectId: id, shareId },
        ip: req.ip,
      });
      return { ok: true };
    },
  );
}
