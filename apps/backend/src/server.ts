import Fastify from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import sensible from "@fastify/sensible";
import { RATE_LIMITS } from "shared";
import { env } from "./config/env.js";
import { logger } from "./lib/logger.js";
import { ApiError } from "./lib/errors.js";
import { authRoutes } from "./routes/auth.js";
import { projectsRoutes } from "./routes/projects.js";
import { sharedRoutes } from "./routes/shared.js";
import { healthRoutes } from "./routes/health.js";
import { adminRoutes } from "./routes/admin.js";
import { calcRoutes } from "./routes/calc.js";
import { auditRoutes } from "./routes/audit.js";
import { teamRoutes } from "./routes/team.js";
import { runAuditCleanup } from "./lib/auditCleanup.js";
import { bootstrapAdmin } from "./db/seed-admin.js";

export async function buildApp() {
  const app = Fastify({ logger, trustProxy: true });

  await app.register(sensible);
  await app.register(helmet, {
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
  });
  await app.register(cors, {
    origin: env.CORS_ORIGIN.split(",").map((s) => s.trim()),
    credentials: true,
  });
  await app.register(cookie);
  await app.register(rateLimit, {
    global: true,
    max: RATE_LIMITS.global.max,
    timeWindow: RATE_LIMITS.global.timeWindow,
    hook: "preHandler",
    errorResponseBuilder: (_req, ctx) => ({
      error: "RATE_LIMITED",
      message: `Хэт олон хүсэлт. ${Math.ceil(ctx.ttl / 1000)} секундын дараа дахин оролдоно уу`,
      statusCode: 429,
    }),
  });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof ApiError) {
      reply.code(err.statusCode).send({
        error: err.code,
        message: err.message,
        statusCode: err.statusCode,
        ...(err.details ? { details: err.details } : {}),
      });
      return;
    }
    // zod validation, drizzle, etc.
    req.log.error({ err }, "unhandled error");
    reply.code(err.statusCode ?? 500).send({
      error: "INTERNAL",
      message: env.NODE_ENV === "production" ? "Серверийн алдаа" : err.message,
      statusCode: err.statusCode ?? 500,
    });
  });

  // All routes under /api
  await app.register(
    async (api) => {
      await api.register(healthRoutes);
      await api.register(authRoutes);
      await api.register(projectsRoutes);
      await api.register(sharedRoutes);
      await api.register(adminRoutes);
      await api.register(calcRoutes);
      await api.register(auditRoutes);
      await api.register(teamRoutes);
    },
    { prefix: "/api" },
  );

  return app;
}

async function main() {
  const app = await buildApp();

  // Phase 6.8.4 (BUG D) — auto-bootstrap the admin user from
  // ADMIN_BOOTSTRAP_* env vars on every dev/prod boot. Idempotent
  // (upserts by email) so re-runs are safe. Without this, a fresh
  // dev environment had no admin row, login returned 401, and that
  // surfaced to users as "Internal Server Error" via the frontend.
  // CLI `pnpm seed:admin` is still available for one-shot seeding
  // outside the server process (e.g., post-migration scripts).
  try {
    const result = await bootstrapAdmin();
    if (result.status === "created") {
      app.log.info({ email: result.email }, "[boot] admin user created");
    } else if (result.status === "updated") {
      app.log.info({ email: result.email }, "[boot] admin user refreshed");
    } else {
      app.log.warn(
        "[boot] ADMIN_BOOTSTRAP_EMAIL / ADMIN_BOOTSTRAP_PASSWORD unset — admin login will return 401 until you set them or run `pnpm seed:admin`.",
      );
    }
  } catch (err) {
    // Don't let a bootstrap failure block server startup — log
    // loudly and continue so /api/health still responds.
    app.log.error({ err }, "[boot] admin bootstrap failed (continuing)");
  }

  // Phase 10.4 — audit-log retention cleanup at startup (90-day window).
  // Fire-and-forget so server boot isn't blocked by the cleanup query.
  void runAuditCleanup().catch((err: unknown) => {
    app.log.warn({ err }, "[boot] audit cleanup failed (non-fatal)");
  });

  try {
    await app.listen({ port: env.PORT, host: "0.0.0.0" });
    // eslint-disable-next-line no-console
    console.log(`[server] listening on http://0.0.0.0:${env.PORT} (${env.NODE_ENV})`);
  } catch (err) {
    app.log.error({ err }, "failed to start");
    process.exit(1);
  }
}

// Only start if run directly (not when imported by tests)
const entry = process.argv[1]?.replace(/\\/g, "/");
if (entry && (entry.endsWith("/server.ts") || entry.endsWith("/server.js") || entry.endsWith("server.ts") || entry.endsWith("server.js"))) {
  main();
}
