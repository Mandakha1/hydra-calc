/**
 * Creates the bootstrap admin user from ADMIN_BOOTSTRAP_EMAIL / ADMIN_BOOTSTRAP_PASSWORD.
 * Idempotent — upserts by email.
 *
 * Phase 6.8.4 (BUG D): refactored to export `bootstrapAdmin()` so the
 * server startup path can call it automatically. Without auto-bootstrap,
 * a fresh dev environment had no admin user, login returned 401, and
 * users misread the failure as "Internal Server Error". The CLI script
 * (`pnpm seed:admin`) still works for prod deploys + scripted seeding.
 */
import bcrypt from "bcrypt";
import { eq } from "drizzle-orm";
import { db, closeDb, schema } from "./client.js";
import { env } from "../config/env.js";

/**
 * Result type for the bootstrap helper — gives the caller enough
 * info to log a friendly message without re-querying.
 */
export type BootstrapResult =
  | { status: "skipped"; reason: "env-unset" }
  | { status: "created"; email: string }
  | { status: "updated"; email: string };

/**
 * Idempotently upsert the bootstrap admin user when the env vars are
 * set. Caller decides whether to close the DB pool afterwards (the
 * CLI script closes it; the server keeps the pool open for incoming
 * traffic).
 *
 * Returns a structured result rather than logging directly so server
 * + CLI can format messages to their own logger.
 */
export async function bootstrapAdmin(): Promise<BootstrapResult> {
  if (!env.ADMIN_BOOTSTRAP_EMAIL || !env.ADMIN_BOOTSTRAP_PASSWORD) {
    return { status: "skipped", reason: "env-unset" };
  }

  const email = env.ADMIN_BOOTSTRAP_EMAIL.toLowerCase();
  const hash = await bcrypt.hash(env.ADMIN_BOOTSTRAP_PASSWORD, 12);

  const existing = await db.query.users.findFirst({
    where: eq(schema.users.email, email),
  });

  if (existing) {
    await db
      .update(schema.users)
      .set({ role: "admin", passwordHash: hash, verified: true, updatedAt: new Date() })
      .where(eq(schema.users.id, existing.id));
    return { status: "updated", email };
  }

  await db.insert(schema.users).values({
    email,
    passwordHash: hash,
    name: "Administrator",
    role: "admin",
    verified: true,
  });
  return { status: "created", email };
}

/* ─── CLI entry ─────────────────────────────────────────────────── */

/**
 * Detect whether this module was invoked directly via
 * `tsx src/db/seed-admin.ts` (the `pnpm seed:admin` script) vs
 * imported by another module (e.g. the server startup path).
 *
 * The endsWith check covers both POSIX and Windows path separators
 * after we normalise backslashes.
 */
function wasInvokedAsCli(): boolean {
  const entry = process.argv[1]?.replace(/\\/g, "/") ?? "";
  return entry.endsWith("/seed-admin.ts") || entry.endsWith("/seed-admin.js");
}

if (wasInvokedAsCli()) {
  bootstrapAdmin()
    .then(async (result) => {
      if (result.status === "skipped") {
        // eslint-disable-next-line no-console
        console.warn("[seed:admin] ADMIN_BOOTSTRAP_EMAIL / ADMIN_BOOTSTRAP_PASSWORD not set — skipping.");
      } else if (result.status === "created") {
        // eslint-disable-next-line no-console
        console.log(`[seed:admin] created admin: ${result.email}`);
      } else {
        // eslint-disable-next-line no-console
        console.log(`[seed:admin] updated existing admin: ${result.email}`);
      }
      await closeDb();
    })
    .catch(async (err) => {
      // eslint-disable-next-line no-console
      console.error("[seed:admin] failed:", err);
      await closeDb().catch(() => undefined);
      process.exit(1);
    });
}
