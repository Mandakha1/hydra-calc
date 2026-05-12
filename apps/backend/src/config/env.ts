import { z } from "zod";
import "dotenv/config";
import { readFileSync, existsSync } from "node:fs";

/**
 * Resolve a secret. Supports two layouts:
 *   - plain env: `JWT_SECRET=...`
 *   - docker secrets: `JWT_SECRET_FILE=/run/secrets/jwt_secret`
 */
function resolveSecret(envName: string): string | undefined {
  const fileVar = process.env[`${envName}_FILE`];
  if (fileVar && existsSync(fileVar)) {
    return readFileSync(fileVar, "utf8").trim();
  }
  return process.env[envName];
}

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),

  USE_PGLITE: z.coerce.boolean().default(false),
  PGLITE_PATH: z.string().default("./data/pglite"),
  DATABASE_URL: z.string().url().optional(),

  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 chars"),
  JWT_ACCESS_TTL: z.coerce.number().int().positive().default(900),
  JWT_REFRESH_TTL: z.coerce.number().int().positive().default(2592000),

  COOKIE_DOMAIN: z.string().optional().default(""),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),

  ADMIN_BOOTSTRAP_EMAIL: z.string().email().optional(),
  ADMIN_BOOTSTRAP_PASSWORD: z.string().min(8).optional(),
});

const raw = {
  NODE_ENV: process.env.NODE_ENV,
  PORT: process.env.PORT,
  LOG_LEVEL: process.env.LOG_LEVEL,

  USE_PGLITE: process.env.USE_PGLITE,
  PGLITE_PATH: process.env.PGLITE_PATH,

  DATABASE_URL: (() => {
    const url = process.env.DATABASE_URL;
    const pwd = resolveSecret("DATABASE_PASSWORD");
    if (url && pwd && !url.includes("@")) {
      return url.replace("://", `://hydra:${encodeURIComponent(pwd)}@`);
    }
    if (url && pwd && url.includes("hydra@")) {
      return url.replace("hydra@", `hydra:${encodeURIComponent(pwd)}@`);
    }
    return url;
  })(),

  JWT_SECRET: resolveSecret("JWT_SECRET"),
  JWT_ACCESS_TTL: process.env.JWT_ACCESS_TTL,
  JWT_REFRESH_TTL: process.env.JWT_REFRESH_TTL,

  COOKIE_DOMAIN: process.env.COOKIE_DOMAIN,
  CORS_ORIGIN: process.env.CORS_ORIGIN,

  ADMIN_BOOTSTRAP_EMAIL: process.env.ADMIN_BOOTSTRAP_EMAIL,
  ADMIN_BOOTSTRAP_PASSWORD: process.env.ADMIN_BOOTSTRAP_PASSWORD,
};

const parsed = EnvSchema.safeParse(raw);
if (!parsed.success) {
  console.error("❌ Invalid environment:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;
