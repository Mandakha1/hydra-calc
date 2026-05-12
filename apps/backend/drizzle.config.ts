import type { Config } from "drizzle-kit";
import "dotenv/config";

export default {
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://hydra:hydra@localhost:5432/hydra",
  },
  strict: true,
  verbose: true,
} satisfies Config;
