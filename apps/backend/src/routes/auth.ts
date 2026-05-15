import type { FastifyInstance, FastifyRequest } from "fastify";
import { and, eq, gt, isNull } from "drizzle-orm";
import { z } from "zod";
import { registerSchema, loginSchema, RATE_LIMITS } from "shared";
import { db, schema } from "../db/client.js";
import { hashPassword, verifyPassword } from "../auth/bcrypt.js";
import {
  signAccessToken,
  generateRefreshToken,
  hashRefreshToken,
} from "../auth/jwt.js";
import { setRefreshCookie, clearRefreshCookie, REFRESH_COOKIE } from "../auth/cookies.js";
import { requireAuth } from "../auth/middleware.js";
import { errors } from "../lib/errors.js";
import { env } from "../config/env.js";
import { sendEmail, generateEmailToken } from "../lib/email.js";

/** Phase 10.1 — base URL the frontend serves the verify/reset routes from.
 *  Comes from the CORS_ORIGIN env (already validated) so it works for
 *  localhost dev + production single-domain deploys without extra config. */
function publicAppBaseUrl(): string {
  return env.CORS_ORIGIN.split(",")[0]!.trim().replace(/\/$/, "");
}

function publicUser(row: schema.User) {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role as "user" | "admin",
    verified: row.verified,
    createdAt: row.createdAt.toISOString(),
  };
}

async function issueTokens(
  app: FastifyInstance,
  user: schema.User,
  req: FastifyRequest,
) {
  const access = signAccessToken({ sub: user.id, email: user.email, role: user.role as "user" | "admin" });
  const refresh = generateRefreshToken();
  const refreshHash = hashRefreshToken(refresh);
  const expiresAt = new Date(Date.now() + env.JWT_REFRESH_TTL * 1000);

  await db.insert(schema.sessions).values({
    userId: user.id,
    refreshTokenHash: refreshHash,
    ip: req.ip,
    userAgent: req.headers["user-agent"]?.slice(0, 500) ?? null,
    expiresAt,
  });

  return { access, refresh };
}

export async function authRoutes(app: FastifyInstance) {
  /* ---------------- register ---------------- */
  app.post(
    "/auth/register",
    { config: { rateLimit: RATE_LIMITS.register } },
    async (req, reply) => {
      const input = registerSchema.safeParse(req.body);
      if (!input.success) throw errors.validation(input.error.flatten());

      const existing = await db.query.users.findFirst({
        where: eq(schema.users.email, input.data.email),
      });
      if (existing) throw errors.conflict("Энэ и-мэйл бүртгэлтэй байна");

      const passwordHash = await hashPassword(input.data.password);
      // Phase 10.1 — generate email verification token at signup; the
      // user's `verified` stays false until they click the link.
      const verifyToken = generateEmailToken();
      const [created] = await db
        .insert(schema.users)
        .values({
          email: input.data.email,
          passwordHash,
          name: input.data.name ?? null,
          emailVerificationToken: verifyToken,
        })
        .returning();
      if (!created) throw errors.internal("Бүртгэл үүсгэж чадсангүй");

      // Fire-and-forget email (dev mode logs to console). Don't block
      // the response — engineer can refresh /verify-email page from
      // their inbox after the email lands.
      const verifyLink = `${publicAppBaseUrl()}/verify-email?token=${verifyToken}`;
      void sendEmail({
        to: created.email,
        template: "welcome",
        recipientName: created.name ?? undefined,
        data: { verifyLink },
      }).catch((err: unknown) => {
        app.log.warn({ err, userId: created.id }, "register email failed");
      });

      await db.insert(schema.auditLog).values({
        userId: created.id,
        action: "register",
        ip: req.ip,
      });

      const { access, refresh } = await issueTokens(app, created, req);
      setRefreshCookie(reply, refresh);
      reply.code(201);
      return {
        user: publicUser(created),
        accessToken: access.token,
        accessExpiresAt: access.expiresAt,
      };
    },
  );

  /* ---------------- login ---------------- */
  app.post(
    "/auth/login",
    { config: { rateLimit: RATE_LIMITS.login } },
    async (req, reply) => {
      const input = loginSchema.safeParse(req.body);
      if (!input.success) throw errors.validation(input.error.flatten());

      const user = await db.query.users.findFirst({
        where: eq(schema.users.email, input.data.email),
      });
      if (!user) throw errors.unauthorized("И-мэйл эсвэл нууц үг буруу");

      const ok = await verifyPassword(input.data.password, user.passwordHash);
      if (!ok) {
        await db.insert(schema.auditLog).values({
          userId: user.id,
          action: "login.failed",
          ip: req.ip,
        });
        throw errors.unauthorized("И-мэйл эсвэл нууц үг буруу");
      }

      await db
        .update(schema.users)
        .set({ lastLoginAt: new Date() })
        .where(eq(schema.users.id, user.id));

      await db.insert(schema.auditLog).values({
        userId: user.id,
        action: "login",
        ip: req.ip,
      });

      const { access, refresh } = await issueTokens(app, user, req);
      setRefreshCookie(reply, refresh);
      return {
        user: publicUser(user),
        accessToken: access.token,
        accessExpiresAt: access.expiresAt,
      };
    },
  );

  /* ---------------- refresh ---------------- */
  app.post(
    "/auth/refresh",
    { config: { rateLimit: RATE_LIMITS.refresh } },
    async (req, reply) => {
      const cookies = (req as unknown as { cookies: Record<string, string> }).cookies ?? {};
      const refresh = cookies[REFRESH_COOKIE];
      if (!refresh) throw errors.unauthorized("Refresh token олдсонгүй");

      const refreshHash = hashRefreshToken(refresh);
      const session = await db.query.sessions.findFirst({
        where: and(
          eq(schema.sessions.refreshTokenHash, refreshHash),
          gt(schema.sessions.expiresAt, new Date()),
          isNull(schema.sessions.revokedAt),
        ),
      });
      if (!session) {
        clearRefreshCookie(reply);
        throw errors.unauthorized("Refresh token хүчингүй");
      }

      const user = await db.query.users.findFirst({
        where: eq(schema.users.id, session.userId),
      });
      if (!user) throw errors.unauthorized();

      // Rotate: revoke old, issue new
      await db
        .update(schema.sessions)
        .set({ revokedAt: new Date() })
        .where(eq(schema.sessions.id, session.id));

      const { access, refresh: newRefresh } = await issueTokens(app, user, req);
      setRefreshCookie(reply, newRefresh);
      return {
        user: publicUser(user),
        accessToken: access.token,
        accessExpiresAt: access.expiresAt,
      };
    },
  );

  /* ---------------- logout ---------------- */
  app.post("/auth/logout", { preHandler: requireAuth }, async (req, reply) => {
    const cookies = (req as unknown as { cookies: Record<string, string> }).cookies ?? {};
    const refresh = cookies[REFRESH_COOKIE];
    if (refresh) {
      const refreshHash = hashRefreshToken(refresh);
      await db
        .update(schema.sessions)
        .set({ revokedAt: new Date() })
        .where(eq(schema.sessions.refreshTokenHash, refreshHash));
    }
    clearRefreshCookie(reply);
    await db.insert(schema.auditLog).values({
      userId: req.user!.sub,
      action: "logout",
      ip: req.ip,
    });
    return { ok: true };
  });

  /* ---------------- me ---------------- */
  app.get("/auth/me", { preHandler: requireAuth }, async (req) => {
    const user = await db.query.users.findFirst({
      where: eq(schema.users.id, req.user!.sub),
    });
    if (!user) throw errors.unauthorized();
    return { user: publicUser(user) };
  });

  /* ---------------- verify-email (Phase 10.1) ---------------- */
  app.post(
    "/auth/verify-email",
    { config: { rateLimit: RATE_LIMITS.login } },
    async (req, _reply) => {
      const schemaIn = z.object({ token: z.string().min(10).max(200) });
      const input = schemaIn.safeParse(req.body);
      if (!input.success) throw errors.validation(input.error.flatten());
      const user = await db.query.users.findFirst({
        where: eq(schema.users.emailVerificationToken, input.data.token),
      });
      if (!user) throw errors.unauthorized("Холбоос хүчингүй");
      await db
        .update(schema.users)
        .set({ verified: true, emailVerificationToken: null })
        .where(eq(schema.users.id, user.id));
      await db.insert(schema.auditLog).values({
        userId: user.id,
        action: "email.verified",
        ip: req.ip,
      });
      return { ok: true };
    },
  );

  /* ---------------- forgot password (Phase 10.1) ---------------- */
  app.post(
    "/auth/forgot",
    { config: { rateLimit: RATE_LIMITS.register } },
    async (req, _reply) => {
      const schemaIn = z.object({ email: z.string().email() });
      const input = schemaIn.safeParse(req.body);
      if (!input.success) throw errors.validation(input.error.flatten());
      const user = await db.query.users.findFirst({
        where: eq(schema.users.email, input.data.email),
      });
      // Always return ok — don't leak whether email exists.
      if (user) {
        const token = generateEmailToken();
        const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
        await db
          .update(schema.users)
          .set({ passwordResetToken: token, passwordResetExpires: expires })
          .where(eq(schema.users.id, user.id));
        const resetLink = `${publicAppBaseUrl()}/reset-password?token=${token}`;
        void sendEmail({
          to: user.email,
          template: "reset_password",
          recipientName: user.name ?? undefined,
          data: { resetLink },
        }).catch((err: unknown) => {
          app.log.warn({ err, userId: user.id }, "forgot email failed");
        });
        await db.insert(schema.auditLog).values({
          userId: user.id,
          action: "password.reset.requested",
          ip: req.ip,
        });
      }
      return { ok: true };
    },
  );

  /* ---------------- reset password (Phase 10.1) ---------------- */
  app.post(
    "/auth/reset",
    { config: { rateLimit: RATE_LIMITS.register } },
    async (req, _reply) => {
      const schemaIn = z.object({
        token: z.string().min(10).max(200),
        newPassword: z.string().min(8).max(120),
      });
      const input = schemaIn.safeParse(req.body);
      if (!input.success) throw errors.validation(input.error.flatten());
      const user = await db.query.users.findFirst({
        where: and(
          eq(schema.users.passwordResetToken, input.data.token),
          gt(schema.users.passwordResetExpires, new Date()),
        ),
      });
      if (!user) throw errors.unauthorized("Холбоос хүчингүй эсвэл хугацаа дууссан");
      const passwordHash = await hashPassword(input.data.newPassword);
      await db
        .update(schema.users)
        .set({
          passwordHash,
          passwordResetToken: null,
          passwordResetExpires: null,
        })
        .where(eq(schema.users.id, user.id));
      // Revoke all sessions on password reset — security best practice.
      await db
        .update(schema.sessions)
        .set({ revokedAt: new Date() })
        .where(and(
          eq(schema.sessions.userId, user.id),
          isNull(schema.sessions.revokedAt),
        ));
      await db.insert(schema.auditLog).values({
        userId: user.id,
        action: "password.reset.completed",
        ip: req.ip,
      });
      return { ok: true };
    },
  );
}
