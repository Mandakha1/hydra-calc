import type { FastifyInstance } from "fastify";
import { sql } from "drizzle-orm";
import { db } from "../db/client.js";

export async function healthRoutes(app: FastifyInstance) {
  app.get("/health", async () => {
    const start = Date.now();
    try {
      await db.execute(sql`SELECT 1`);
      return { ok: true, db: "up", latencyMs: Date.now() - start };
    } catch (err) {
      app.log.error({ err }, "health: db ping failed");
      return { ok: false, db: "down", latencyMs: Date.now() - start };
    }
  });
}
