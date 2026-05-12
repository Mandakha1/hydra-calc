/**
 * Two-mode database client.
 *
 *  - USE_PGLITE=1  → embedded WASM Postgres (no install needed, file-backed at PGLITE_PATH)
 *  - otherwise     → node-postgres Pool against DATABASE_URL (production)
 *
 * Drizzle's query API is identical across both adapters, so the rest of the codebase
 * doesn't care which backend is active.
 */
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import * as schema from "./schema.js";
import { env } from "../config/env.js";

export { schema };

let _close: () => Promise<void> = async () => undefined;

async function createDb() {
  if (env.USE_PGLITE) {
    const [{ PGlite }, { drizzle }] = await Promise.all([
      import("@electric-sql/pglite"),
      import("drizzle-orm/pglite"),
    ]);
    // PGlite needs the data dir to exist before instantiation.
    const absPath = resolve(env.PGLITE_PATH);
    mkdirSync(dirname(absPath), { recursive: true });
    mkdirSync(absPath, { recursive: true });
    const pg = new PGlite(absPath);
    _close = async () => {
      await pg.close();
    };
    // eslint-disable-next-line no-console
    console.log(`[db] Using PGlite at ${env.PGLITE_PATH}`);
    return drizzle(pg, { schema });
  }

  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL required when USE_PGLITE is off");
  }
  const [pgModule, { drizzle }] = await Promise.all([
    import("pg"),
    import("drizzle-orm/node-postgres"),
  ]);
  const { Pool } = pgModule.default;
  const pool = new Pool({
    connectionString: env.DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
  pool.on("error", (err) => {
    // eslint-disable-next-line no-console
    console.error("[pg pool] unexpected error:", err);
  });
  _close = async () => {
    await pool.end();
  };
  // eslint-disable-next-line no-console
  console.log("[db] Using node-postgres Pool");
  return drizzle(pool, { schema });
}

// Top-level await — works in ESM modules (ES2022).
export const db = await createDb();

export async function closeDb() {
  await _close();
}

// Backwards compat — some callers used `pool.end()` before.
export const pool = { end: closeDb };

export type DB = typeof db;
