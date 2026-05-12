/**
 * Creates the bootstrap admin user from ADMIN_BOOTSTRAP_EMAIL / ADMIN_BOOTSTRAP_PASSWORD.
 * Idempotent — upserts by email.
 */
import bcrypt from "bcrypt";
import { eq } from "drizzle-orm";
import { db, closeDb, schema } from "./client.js";
import { env } from "../config/env.js";

async function main() {
  if (!env.ADMIN_BOOTSTRAP_EMAIL || !env.ADMIN_BOOTSTRAP_PASSWORD) {
    // eslint-disable-next-line no-console
    console.warn("[seed:admin] ADMIN_BOOTSTRAP_EMAIL / ADMIN_BOOTSTRAP_PASSWORD not set — skipping.");
    await closeDb();
    return;
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
    // eslint-disable-next-line no-console
    console.log(`[seed:admin] updated existing admin: ${email}`);
  } else {
    await db.insert(schema.users).values({
      email,
      passwordHash: hash,
      name: "Administrator",
      role: "admin",
      verified: true,
    });
    // eslint-disable-next-line no-console
    console.log(`[seed:admin] created admin: ${email}`);
  }

  await closeDb();
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("[seed:admin] failed:", err);
  process.exit(1);
});
