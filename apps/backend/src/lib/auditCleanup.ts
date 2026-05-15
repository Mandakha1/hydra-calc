/**
 * Phase 10.4 — Audit-log retention cleanup.
 *
 * Runs at backend startup. Deletes audit_log rows older than 90 days.
 * Logs the row count to ops + the lib/logger.
 *
 * Why startup-triggered (not a separate cron):
 *   - Hydra Calc backend runs as a single Fastify process on Oracle
 *     Cloud Always Free (no separate worker / cron infra)
 *   - 90-day cleanup is a slow-burn operation — 1 backend restart per
 *     day is enough granularity
 *   - Phase 11 polish could move this to a Fastify scheduled task or
 *     external cron if traffic warrants
 *
 * Safety: deletes only `audit_log` rows. Other tables untouched.
 */
import { sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { logger } from "./logger.js";

/** Audit retention in days. Engineer-visible Activity feed shows only
 *  entries within this window. Pre-launch we picked 90 days as a
 *  balance between debug-value (engineers want to see history) and
 *  storage cost (PostgreSQL ~200 bytes/row × thousands per project). */
export const AUDIT_RETENTION_DAYS = 90;

/**
 * Delete audit rows older than the retention window.
 * Returns the row count that was deleted.
 */
export async function runAuditCleanup(): Promise<number> {
  // Drizzle's delete builder doesn't have a fluent `where(sql)` that
  // returns a count cleanly for PGlite + Postgres both, so we use
  // raw SQL via the db.execute helper.
  const cutoff = new Date(Date.now() - AUDIT_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const result = await db.execute(
    sql`DELETE FROM "audit_log" WHERE "created_at" < ${cutoff.toISOString()}`,
  );
  // db.execute returns provider-specific shape; we count via rowsAffected
  // when available, otherwise just return 0. Engineers can read the
  // actual count from Postgres logs if they care.
  const count = (result as unknown as { rowCount?: number; rowsAffected?: number }).rowCount
    ?? (result as unknown as { rowCount?: number; rowsAffected?: number }).rowsAffected
    ?? 0;
  logger.info(
    { cutoff: cutoff.toISOString(), deleted: count },
    `audit-cleanup: removed ${count} rows older than ${AUDIT_RETENTION_DAYS} days`,
  );
  return count;
}
