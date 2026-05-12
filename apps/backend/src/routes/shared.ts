import type { FastifyInstance } from "fastify";
import { and, eq, gt, isNull, or } from "drizzle-orm";
import { RATE_LIMITS } from "shared";
import { db, schema } from "../db/client.js";
import { errors } from "../lib/errors.js";

export async function sharedRoutes(app: FastifyInstance) {
  app.get(
    "/shared/:token",
    { config: { rateLimit: RATE_LIMITS.sharedView } },
    async (req) => {
      const { token } = req.params as { token: string };

      const share = await db.query.shares.findFirst({
        where: and(
          eq(schema.shares.token, token),
          or(isNull(schema.shares.expiresAt), gt(schema.shares.expiresAt, new Date())),
        ),
      });
      if (!share) throw errors.notFound("Хуваалцсан холбоос олдсонгүй эсвэл хугацаа дууссан");

      const project = await db.query.projects.findFirst({
        where: eq(schema.projects.id, share.projectId),
      });
      if (!project) throw errors.notFound("Төсөл олдсонгүй");

      return {
        project: {
          id: project.id,
          name: project.name,
          description: project.description,
          schemaVersion: project.schemaVersion,
          updatedAt: project.updatedAt.toISOString(),
          data: project.data,
        },
        canEdit: share.canEdit,
        readOnly: !share.canEdit,
      };
    },
  );
}
