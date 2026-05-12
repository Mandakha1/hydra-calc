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
    },
    { prefix: "/api" },
  );

  return app;
}

async function main() {
  const app = await buildApp();
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
