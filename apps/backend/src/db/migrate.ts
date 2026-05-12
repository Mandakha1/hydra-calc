/**
 * Apply SQL migrations from ./drizzle.
 * Idempotent — every statement uses `IF NOT EXISTS` / `IF EXISTS`.
 *
 * For PGlite: uses `pg.exec()` which supports multi-statement SQL.
 * For node-postgres: uses pool.query() which also supports multi-statement.
 */
import { readFileSync, readdirSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "../config/env.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = resolve(__dirname, "../../drizzle");

async function execAll(sqlText: string) {
  if (env.USE_PGLITE) {
    const { PGlite } = await import("@electric-sql/pglite");
    const absPath = resolve(env.PGLITE_PATH);
    mkdirSync(absPath, { recursive: true });
    const pg = new PGlite(absPath);
    await pg.exec(sqlText);
    await pg.close();
    return;
  }
  if (!env.DATABASE_URL) throw new Error("DATABASE_URL required");
  const pgModule = await import("pg");
  const client = new pgModule.default.Client({ connectionString: env.DATABASE_URL });
  await client.connect();
  await client.query(sqlText);
  await client.end();
}

async function main() {
  if (!existsSync(migrationsDir)) {
    console.warn(`[migrate] no drizzle/ dir at ${migrationsDir}, skipping`);
    return;
  }

  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const f of files) {
    const content = readFileSync(resolve(migrationsDir, f), "utf8");
    console.log(`[migrate] applying ${f} (${env.USE_PGLITE ? "pglite" : "pg"})`);
    await execAll(content);
  }

  console.log("[migrate] done");
}

main().catch((err) => {
  console.error("[migrate] failed:", err);
  process.exit(1);
});
