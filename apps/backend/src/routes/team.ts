/**
 * Phase 10.5 — Project members + approval workflow.
 *
 * Endpoints:
 *   GET    /api/projects/:id/members
 *   POST   /api/projects/:id/members            (add by email)
 *   DELETE /api/projects/:id/members/:userId
 *   PATCH  /api/projects/:id/approve            (approver acts)
 *
 * Permission model (per Phase 10 super prompt decision 6):
 *   - engineer: full edit + share + delete (owner-equivalent)
 *   - checker:  view + comment + run compliance
 *   - approver: view + approve / reject
 *
 * The project owner (projects.user_id) is IMPLICITLY an engineer —
 * they don't appear in project_members rows. The owner always has
 * full permissions and cannot be removed via this API; cascade
 * delete of the project removes the team too.
 *
 * For Phase 10.5 MVP we ship the data model + ownership checks;
 * actual route-level role gating (engineer can edit, checker
 * cannot) is a follow-up that has to thread through every
 * mutation endpoint in projects.ts. Phase 11 polish.
 */
import type { FastifyInstance } from "fastify";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "../db/client.js";
import { requireAuth } from "../auth/middleware.js";
import { errors } from "../lib/errors.js";

const ROLES = ["engineer", "checker", "approver"] as const;
type Role = typeof ROLES[number];

const addMemberSchema = z.object({
  userEmail: z.string().email(),
  role: z.enum(ROLES),
});

async function assertOwnsProject(projectId: string, userId: string) {
  const project = await db.query.projects.findFirst({
    where: and(eq(schema.projects.id, projectId), eq(schema.projects.userId, userId)),
  });
  if (!project) throw errors.notFound("Төсөл олдсонгүй (зөвхөн төслийн эзэн багт өөрчлөлт хийнэ)");
  return project;
}

export async function teamRoutes(app: FastifyInstance) {
  /* ---------------- list members ---------------- */
  app.get(
    "/projects/:id/members",
    { preHandler: requireAuth },
    async (req) => {
      const { id } = req.params as { id: string };
      // Owner OR team member of the project can list.
      const project = await db.query.projects.findFirst({
        where: eq(schema.projects.id, id),
      });
      if (!project) throw errors.notFound("Төсөл олдсонгүй");
      const isOwner = project.userId === req.user!.sub;
      const isMember = !isOwner && await db.query.projectMembers.findFirst({
        where: and(
          eq(schema.projectMembers.projectId, id),
          eq(schema.projectMembers.userId, req.user!.sub),
        ),
      });
      if (!isOwner && !isMember) throw errors.unauthorized("Багт хандах эрхгүй");

      const members = await db.query.projectMembers.findMany({
        where: eq(schema.projectMembers.projectId, id),
      });
      // Fetch user metadata for each member in a single query.
      const userIds = members.map((m) => m.userId);
      const users = userIds.length === 0
        ? []
        : await db.query.users.findMany({
            where: (u, ops) => ops.inArray(u.id, userIds),
          });
      const userById = new Map(users.map((u) => [u.id, u]));

      // The owner is implicit — surface as a synthetic row labelled engineer.
      const owner = await db.query.users.findFirst({
        where: eq(schema.users.id, project.userId),
      });

      return {
        members: [
          ...(owner ? [{
            userId: owner.id,
            email: owner.email,
            name: owner.name,
            role: "engineer" as Role,
            addedAt: project.createdAt.toISOString(),
            isOwner: true,
            approvedAt: null,
          }] : []),
          ...members.map((m) => {
            const u = userById.get(m.userId);
            return {
              userId: m.userId,
              email: u?.email ?? null,
              name: u?.name ?? null,
              role: m.role as Role,
              addedAt: m.addedAt.toISOString(),
              isOwner: false,
              approvedAt: m.approvedAt?.toISOString() ?? null,
            };
          }),
        ],
      };
    },
  );

  /* ---------------- add member ---------------- */
  app.post(
    "/projects/:id/members",
    { preHandler: requireAuth },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      await assertOwnsProject(id, req.user!.sub);
      const input = addMemberSchema.safeParse(req.body);
      if (!input.success) throw errors.validation(input.error.flatten());

      const user = await db.query.users.findFirst({
        where: eq(schema.users.email, input.data.userEmail),
      });
      if (!user) throw errors.notFound("Хэрэглэгч олдсонгүй (бүртгэлгүй и-мэйл)");
      if (user.id === req.user!.sub) {
        throw errors.validation("Төслийн эзэн хувьдаа гишүүн нэмэх боломжгүй");
      }

      // Insert with PK conflict → 409 (already a member with some role)
      try {
        await db.insert(schema.projectMembers).values({
          projectId: id,
          userId: user.id,
          role: input.data.role,
          addedBy: req.user!.sub,
        });
      } catch (e) {
        if (e instanceof Error && /unique|duplicate|members_pk/i.test(e.message)) {
          throw errors.conflict("Хэрэглэгч аль хэдийнэ багт байна — устгаад дахин нэмнэ үү");
        }
        throw e;
      }

      await db.insert(schema.auditLog).values({
        userId: req.user!.sub,
        projectId: id,
        action: "team.member.added",
        details: { email: input.data.userEmail, role: input.data.role },
        ip: req.ip,
      });

      reply.code(201);
      return {
        member: {
          userId: user.id,
          email: user.email,
          name: user.name,
          role: input.data.role,
        },
      };
    },
  );

  /* ---------------- remove member ---------------- */
  app.delete(
    "/projects/:id/members/:userId",
    { preHandler: requireAuth },
    async (req) => {
      const { id, userId } = req.params as { id: string; userId: string };
      await assertOwnsProject(id, req.user!.sub);
      const result = await db
        .delete(schema.projectMembers)
        .where(and(
          eq(schema.projectMembers.projectId, id),
          eq(schema.projectMembers.userId, userId),
        ))
        .returning();
      if (result.length === 0) throw errors.notFound("Гишүүн олдсонгүй");
      await db.insert(schema.auditLog).values({
        userId: req.user!.sub,
        projectId: id,
        action: "team.member.removed",
        details: { removedUserId: userId },
        ip: req.ip,
      });
      return { ok: true };
    },
  );

  /* ---------------- approve project (approver only) ---------------- */
  // Note: PUT (not PATCH) — keeps frontend api helper minimal
  app.put(
    "/projects/:id/approve",
    { preHandler: requireAuth },
    async (req) => {
      const { id } = req.params as { id: string };
      // Must be an approver on this project.
      const member = await db.query.projectMembers.findFirst({
        where: and(
          eq(schema.projectMembers.projectId, id),
          eq(schema.projectMembers.userId, req.user!.sub),
        ),
      });
      if (!member || member.role !== "approver") {
        throw errors.unauthorized("Зөвхөн approver зөвшөөрөл өгөх боломжтой");
      }
      const approvedAt = new Date();
      await db
        .update(schema.projectMembers)
        .set({ approvedAt })
        .where(and(
          eq(schema.projectMembers.projectId, id),
          eq(schema.projectMembers.userId, req.user!.sub),
        ));
      await db.insert(schema.auditLog).values({
        userId: req.user!.sub,
        projectId: id,
        action: "project.approved",
        details: { approverId: req.user!.sub },
        ip: req.ip,
      });
      return {
        approved: true,
        approverId: req.user!.sub,
        approvedAt: approvedAt.toISOString(),
      };
    },
  );
}
