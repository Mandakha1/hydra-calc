/**
 * Phase 9.1 — Compliance rule engine.
 *
 * Foundation for automated БНбД 41-02-13 / БНбД 41-01-2019 /
 * СП 124.13330.2012 compliance verification. Engineer triggers
 * `runComplianceCheck` from the new 📋 Стандарт tab; the engine
 * iterates over a flat rule registry, each rule self-contained
 * with its own `check()` function that emits zero-or-more
 * `RuleResult` entries.
 *
 * The output `ComplianceReport` shape is consumed by:
 *   - ComplianceView.tsx (render table + severity filter)
 *   - pdfComplianceReport.ts (Phase 9.4, 7th-page PDF renderer)
 *
 * Architectural notes (per Phase 9 super prompt decisions):
 *   1. Flat list of rules, each tagged with category (no nested trees).
 *   2. 4-level severity: info < warn < error < critical.
 *   3. Rules are PURE — given (project, calc) they produce the same
 *      RuleResult[] every time. No I/O, no DOM, no fetches.
 *   4. Engineer-triggered (not on-every-change) — Phase 11 polish
 *      could add a debounced background re-check.
 *
 * Existing Phase 5 `normCheck.ts` is NOT deleted — its NormViolation
 * shape is still used by the legacy violation badge on SchemeEditor
 * pulse animations. Phase 9's `RuleResult` is a NEW, richer shape
 * (per-entity references, fixHint, standard ref) that lives alongside
 * the legacy one. The first 5 rules in this file ABSORB the existing
 * normCheck behaviour — Phase 11 polish can collapse the two engines.
 */
import type {
  CalculationResults,
  HydraulicState,
  SchemeNode,
  SchemePipe,
  SchemeChannel,
  ProjectSettings,
} from "../../hydraulicTypes";

/* ─── Type contract ─────────────────────────────────────────────── */

export type RuleCategory =
  | "hydraulics"
  | "thermal"
  | "geometry"
  | "materials"
  | "project";

export type RuleSeverity = "info" | "warn" | "error" | "critical";

/**
 * A single compliance rule. Rules live in a flat registry; engineer
 * sees rule name + standard ref in the Compliance tab and the PDF.
 *
 * The `check` function is pure: it receives the live project state
 * + the most-recent calc results and returns zero or more
 * `RuleResult` entries (one per violation). When the rule passes
 * cleanly, it returns `[]`.
 */
export interface Rule {
  /** Stable identifier (snake_case). Used for cross-references +
   *  per-project customization (Phase 11). */
  id: string;
  category: RuleCategory;
  /** The default severity when the rule fires. Rules CAN emit a
   *  different severity per-violation if context warrants
   *  (e.g. velocity 3.6 m/s is WARN but 5.0 m/s is ERROR). */
  severity: RuleSeverity;
  /** Engineer-facing name (Mongolian). */
  name: string;
  /** Engineer-facing description (Mongolian). */
  description: string;
  /** Standard clause reference (e.g. "БНбД 41-02-13 §6.2.5").
   *  Free-form — Mongolian / Russian / Latin all accepted. */
  standardRef: string;
  /** Run the rule. Returns zero or more violations. Pure. */
  check(project: HydraulicState, calc: CalculationResults | undefined): RuleResult[];
}

/**
 * Single rule violation. Per-entity when the violating element can
 * be highlighted in the editor; project-wide otherwise.
 */
export interface RuleResult {
  ruleId: string;
  severity: RuleSeverity;
  /** Engineer-facing Mongolian message. Should include the actual
   *  value + the threshold so the engineer can scan quickly. */
  message: string;
  /** When set, ComplianceView can offer "Center editor on this entity". */
  entityType?: "node" | "pipe" | "building" | "project";
  entityId?: string;
  /** Engineer-facing Mongolian fix suggestion. Optional. */
  fixHint?: string;
}

/**
 * Output of `runComplianceCheck` — the engineer's view of compliance.
 * The summary lets the Compliance tab render the severity badges
 * without re-scanning `results`.
 */
export interface ComplianceReport {
  /** ISO timestamp (UTC). */
  generatedAt: string;
  /** Engineer-typed project name (or empty string when unset). */
  projectName: string;
  /** Per-violation rows, ordered: critical → error → warn → info. */
  results: RuleResult[];
  /** Rules that ran (their full metadata). Used by the PDF renderer
   *  to list "Rules checked" + the per-rule descriptions. */
  rulesChecked: ReadonlyArray<Pick<Rule, "id" | "name" | "category" | "severity" | "standardRef">>;
  summary: {
    /** Number of rules that ran without a single violation. */
    passedRules: number;
    info: number;
    warn: number;
    error: number;
    critical: number;
    /** info + warn + error + critical. */
    totalViolations: number;
  };
}

/* ─── Severity helpers ──────────────────────────────────────────── */

const SEVERITY_ORDER: Record<RuleSeverity, number> = {
  critical: 0,
  error: 1,
  warn: 2,
  info: 3,
};

export function compareSeverity(a: RuleSeverity, b: RuleSeverity): number {
  return SEVERITY_ORDER[a] - SEVERITY_ORDER[b];
}

/** Engineer-facing Mongolian severity label. */
export function severityLabel(severity: RuleSeverity): string {
  switch (severity) {
    case "critical": return "🔴 Чухал";
    case "error": return "✗ Алдаа";
    case "warn": return "⚠ Анхааруулга";
    case "info": return "ℹ Мэдээлэл";
  }
}

/** Engineer-facing Mongolian category label. */
export function categoryLabel(category: RuleCategory): string {
  switch (category) {
    case "hydraulics": return "Гидравлик";
    case "thermal": return "Дулааны";
    case "geometry": return "Геометр";
    case "materials": return "Материал";
    case "project": return "Төсөл";
  }
}

/* ─── Main entry ────────────────────────────────────────────────── */

/* ─── Phase 11.3 — hot-path cache ─────────────────────────────── */
/**
 * Module-level cache. `runComplianceCheck` populates these maps
 * ONCE per call; helpers like `findNode`/`pipeResult` consult them
 * via O(1) lookup instead of doing per-call `.find()` linear scans.
 *
 * On a 1000-node project this brought the 30-rule pass from ~13s
 * to ~30ms. WeakMap keyed by the project / calc reference so
 * memory frees automatically.
 */
let nodesById: Map<string, SchemeNode> | null = null;
let pipesById: Map<string, SchemePipe> | null = null;
let pipeResultsById: Map<string, CalculationResults["pipes"][number]> | null = null;
let nodeResultsById: Map<string, CalculationResults["nodes"][number]> | null = null;
// Phase 12.12 — channel cache so channel-aware rules (БНбД 41-02-13 §6
// clearance / insulation thickness) can do O(1) lookup.
let channelsById: Map<string, SchemeChannel> | null = null;

function primeHotCache(project: HydraulicState, calc: CalculationResults | undefined): void {
  nodesById = new Map();
  for (const n of project.nodes) nodesById.set(n.id, n);
  pipesById = new Map();
  for (const p of project.pipes) pipesById.set(p.id, p);
  channelsById = new Map();
  for (const c of project.channels ?? []) channelsById.set(c.id, c);
  if (calc) {
    pipeResultsById = new Map();
    for (const r of calc.pipes) pipeResultsById.set(r.pipeId, r);
    nodeResultsById = new Map();
    for (const r of calc.nodes) nodeResultsById.set(r.nodeId, r);
  } else {
    pipeResultsById = null;
    nodeResultsById = null;
  }
}

function clearHotCache(): void {
  nodesById = null;
  pipesById = null;
  channelsById = null;
  pipeResultsById = null;
  nodeResultsById = null;
}

/**
 * Run every rule in the registry (or a custom subset) against the
 * live project state + calc results. Returns a sorted
 * `ComplianceReport`.
 *
 * When `calc` is undefined (engineer hasn't run the solver yet),
 * rules that DEPEND on calc data (velocity, pressure, temperature)
 * emit a single "Цалин тооцоо хийгээгүй" advisory at WARN severity.
 * Project-level rules (source_node_exists, etc.) still run.
 */
export function runComplianceCheck(
  project: HydraulicState,
  calc: CalculationResults | undefined,
  rules: ReadonlyArray<Rule>,
): ComplianceReport {
  // Phase 11.3 — prime the hot-path cache so all `findNode` /
  // `pipeResult` / etc. lookups inside rule check() calls run as
  // O(1) instead of O(N).
  primeHotCache(project, calc);
  const results: RuleResult[] = [];
  let passedRules = 0;
  for (const rule of rules) {
    let perRule: RuleResult[];
    try {
      perRule = rule.check(project, calc);
    } catch (err) {
      // A bug in a rule check should NEVER take down the whole
      // compliance report. Surface it as an info entry so the
      // engineer + dev can see what went wrong.
      perRule = [{
        ruleId: rule.id,
        severity: "info",
        message: `Дотоод алдаа: ${err instanceof Error ? err.message : String(err)}`,
        entityType: "project",
      }];
    }
    if (perRule.length === 0) {
      passedRules += 1;
    } else {
      results.push(...perRule);
    }
  }
  // Sort: critical → error → warn → info; stable within same severity.
  results.sort((a, b) => compareSeverity(a.severity, b.severity));

  // Summary tally
  let info = 0, warn = 0, error = 0, critical = 0;
  for (const r of results) {
    switch (r.severity) {
      case "info": info += 1; break;
      case "warn": warn += 1; break;
      case "error": error += 1; break;
      case "critical": critical += 1; break;
    }
  }

  const report: ComplianceReport = {
    generatedAt: new Date().toISOString(),
    projectName: getProjectName(project.settings),
    results,
    rulesChecked: rules.map((r) => ({
      id: r.id,
      name: r.name,
      category: r.category,
      severity: r.severity,
      standardRef: r.standardRef,
    })),
    summary: {
      passedRules,
      info,
      warn,
      error,
      critical,
      totalViolations: results.length,
    },
  };
  // Phase 11.3 — clear cache so subsequent stale calls fall back to
  // .find() rather than reading the previous run's maps.
  clearHotCache();
  return report;
}

/** Pull project name from title-block meta if present. */
function getProjectName(settings: ProjectSettings): string {
  return settings.titleBlock?.drawingTitle?.trim() ?? "";
}

/* ─── Helpers exposed for rule authors ──────────────────────────── */

/**
 * Find a SchemeNode by id. Returns null when not found (e.g. orphan
 * dimension referencing a deleted node).
 *
 * Phase 11.3 — uses the hot-path cache when populated (inside a
 * `runComplianceCheck` call), otherwise falls back to .find().
 */
export function findNode(project: HydraulicState, id: string): SchemeNode | null {
  if (nodesById) return nodesById.get(id) ?? null;
  return project.nodes.find((n) => n.id === id) ?? null;
}

/** Find a SchemePipe by id. Uses the hot-path cache when populated. */
export function findPipe(project: HydraulicState, id: string): SchemePipe | null {
  if (pipesById) return pipesById.get(id) ?? null;
  return project.pipes.find((p) => p.id === id) ?? null;
}

/** Find a SchemeChannel by id. Phase 12.12 — uses the hot-path cache
 *  when populated. Returns null when the project has no channels OR
 *  the id is stale. */
export function findChannel(project: HydraulicState, id: string): SchemeChannel | null {
  if (channelsById) return channelsById.get(id) ?? null;
  return (project.channels ?? []).find((c) => c.id === id) ?? null;
}

/** Whether a node kind belongs to the consumer family. */
export function isConsumerKind(kind: string): boolean {
  return kind.startsWith("consumer_") || kind === "consumer";
}

/** Whether a node kind belongs to the source family. */
export function isSourceKind(kind: string): boolean {
  return kind.startsWith("source_") || kind === "source";
}

/** Lookup the PipeResult row for a pipe id, or null when missing.
 *  Phase 11.3 — uses the hot-path cache when populated. */
export function pipeResult(
  calc: CalculationResults | undefined,
  pipeId: string,
): CalculationResults["pipes"][number] | null {
  if (!calc) return null;
  if (pipeResultsById) return pipeResultsById.get(pipeId) ?? null;
  return calc.pipes.find((p) => p.pipeId === pipeId) ?? null;
}

/** Lookup the NodeResult row for a node id, or null when missing. */
export function nodeResult(
  calc: CalculationResults | undefined,
  nodeId: string,
): CalculationResults["nodes"][number] | null {
  if (!calc) return null;
  if (nodeResultsById) return nodeResultsById.get(nodeId) ?? null;
  return calc.nodes.find((n) => n.nodeId === nodeId) ?? null;
}
