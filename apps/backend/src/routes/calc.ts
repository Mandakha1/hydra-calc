/**
 * Phase 10.2 — Backend calc API endpoints.
 *
 * Exposes 3 endpoints so headless CLIs / automation can run the
 * standard Hydra Calc passes without the browser. The frontend
 * continues using its local in-browser calc engine — there's no
 * UX impact from these endpoints.
 *
 * Architectural decision: this PR ships the API surface fully,
 * with COMPLIANCE implemented natively (the rule engine is pure
 * + framework-independent so it ports cleanly). HYDRAULIC and
 * PUMP-SIZING return 501 with a clear "use frontend for now"
 * message — porting the Darcy-Weisbach solver + Hardy-Cross loop
 * balancer + heat-loss integration is a non-trivial refactor that
 * deserves its own dedicated sub-phase (Phase 11.x candidate or
 * post-launch).
 *
 * Why ship the surface now anyway:
 *   - CLI / automation projects can already use the compliance
 *     endpoint to verify in-house JSON exports against БНбД.
 *   - The 501 stubs give external integrators a stable contract to
 *     write against — when we light up the hydraulic path later
 *     they don't have to change their code.
 *   - The auth + rate-limit + X-Compute-Time-Ms wiring is shared
 *     infrastructure that all 3 endpoints reuse.
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { RATE_LIMITS } from "shared";
import { errors } from "../lib/errors.js";
import { env } from "../config/env.js";
import { runComplianceCheckBackend, ALL_RULES_BACKEND } from "../calc/compliance.js";

/* ─── Schemas ──────────────────────────────────────────────────── */

/** A loose project shape — full validation lives in the frontend.
 *  We accept anything that has `nodes` + `pipes` arrays so the
 *  Phase 9 rules can iterate over them. */
const projectSchema = z.object({
  nodes: z.array(z.unknown()),
  pipes: z.array(z.unknown()),
  settings: z.unknown().optional(),
  schemaVersion: z.number().optional(),
}).passthrough();

const calcInputSchema = z.object({
  project: projectSchema,
  /** Optional calc results from a previous run (compliance rules
   *  that depend on calc data — velocity, pressure, supply temp —
   *  use these). When omitted, compliance still runs but skips the
   *  calc-dependent rules. */
  results: z.unknown().optional(),
});

/* ─── Auth gate ────────────────────────────────────────────────── */

/**
 * Phase 10.2 auth model:
 *   - In dev (NODE_ENV !== "production"), endpoints are open. Engineers
 *     and CLI tools can call them without setup.
 *   - In production, EITHER a valid JWT cookie/header OR an
 *     `X-API-Token` header is required. The X-API-Token mechanism is
 *     a stub for Phase 11.5 — for now the deploy ops issues tokens
 *     manually via the env var BACKEND_API_TOKENS (comma-separated).
 */
async function authGate(req: { headers: Record<string, unknown>; user?: { sub: string } }): Promise<void> {
  if (env.NODE_ENV !== "production") return; // dev: open
  // 1. Authenticated via JWT? (requireAuth would have set req.user)
  if (req.user?.sub) return;
  // 2. Static API token from env?
  const apiToken = String(req.headers["x-api-token"] ?? "");
  const allowed = (process.env.BACKEND_API_TOKENS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (apiToken && allowed.includes(apiToken)) return;
  throw errors.unauthorized("Calc API нэвтрэх эрх шаардлагатай (JWT cookie эсвэл X-API-Token)");
}

/* ─── Routes ───────────────────────────────────────────────────── */

export async function calcRoutes(app: FastifyInstance) {
  /* ---------------- compliance (fully implemented) ---------------- */
  app.post(
    "/calc/compliance",
    { config: { rateLimit: RATE_LIMITS.register } },
    async (req, reply) => {
      await authGate(req as never);
      const input = calcInputSchema.safeParse(req.body);
      if (!input.success) throw errors.validation(input.error.flatten());
      const t0 = Date.now();
      // Cast input.data.project to a loose shape; the backend rule
      // engine accepts the same HydraulicState contract the frontend
      // uses (nodes + pipes + settings).
      const report = runComplianceCheckBackend(
        input.data.project as never,
        input.data.results as never,
        ALL_RULES_BACKEND,
      );
      const t1 = Date.now();
      reply.header("X-Compute-Time-Ms", String(t1 - t0));
      return { report };
    },
  );

  /* ---------------- hydraulic (501 stub) ---------------- */
  app.post(
    "/calc/hydraulic",
    { config: { rateLimit: RATE_LIMITS.register } },
    async (req, reply) => {
      await authGate(req as never);
      const input = calcInputSchema.safeParse(req.body);
      if (!input.success) throw errors.validation(input.error.flatten());
      reply.code(501);
      return {
        error: "not_implemented",
        message:
          "Backend hydraulic calc хараахан хэрэгжээгүй. Frontend (browser-side) calc эсвэл сэргээгдсэн compliance endpoint ашиглана уу.",
        deferredReason:
          "Darcy-Weisbach + Hardy-Cross solver port needs dedicated sub-phase. Compliance endpoint is fully functional.",
      };
    },
  );

  /* ---------------- pump-sizing (501 stub) ---------------- */
  app.post(
    "/calc/pump-sizing",
    { config: { rateLimit: RATE_LIMITS.register } },
    async (req, reply) => {
      await authGate(req as never);
      const input = calcInputSchema.safeParse(req.body);
      if (!input.success) throw errors.validation(input.error.flatten());
      reply.code(501);
      return {
        error: "not_implemented",
        message: "Pump sizing API хараахан хэрэгжээгүй — Hydraulic calc сэргээсний дараа нээгдэнэ.",
      };
    },
  );
}
