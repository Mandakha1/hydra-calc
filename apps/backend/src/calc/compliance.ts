/**
 * Phase 10.2 — Backend port of the Phase 9 compliance rule engine.
 *
 * The frontend implementation lives at:
 *   apps/frontend/src/components/hydraulic/calc/compliance/
 *
 * This file is a deliberate copy of the PURE rule engine + rule
 * registry. We don't import from the frontend tree because:
 *   - Frontend ships React + DOM imports that would explode at
 *     Node runtime
 *   - Cross-app imports complicate the workspace boundary
 *
 * If the rule registry evolves, both files must stay in sync.
 * Phase 11 polish could extract this to `packages/shared/src/calc/`
 * to remove the duplication; for now the duplication is contained
 * and reviewable in one PR.
 *
 * The shape of `HydraulicState` accepted here is intentionally loose
 * (`unknown`-ish) — the backend doesn't import the frontend's
 * `hydraulicTypes.ts`. The rule checks read structural properties
 * (`nodes[].kind`, `pipes[].circuit`) via runtime type guards.
 *
 * Mongolian engineering convention notes:
 *   - Velocity hard limit 3.5 m/s (СП 124.13330.2012 §6.2.5)
 *   - Δp ≥ 0.15 MPa at consumer (БНбД 41-02-13 §7.1.8)
 *   - Supply T ≥ 80°C (БНбД 41-01-2019 §5.4)
 */

/* ─── Type contract (loose copy of frontend) ──────────────────── */

export type RuleCategory =
  | "hydraulics"
  | "thermal"
  | "geometry"
  | "materials"
  | "project";

export type RuleSeverity = "info" | "warn" | "error" | "critical";

export interface BackendRuleResult {
  ruleId: string;
  severity: RuleSeverity;
  message: string;
  entityType?: "node" | "pipe" | "building" | "project";
  entityId?: string;
  fixHint?: string;
}

export interface BackendRule {
  id: string;
  category: RuleCategory;
  severity: RuleSeverity;
  name: string;
  description: string;
  standardRef: string;
  // Loose typing — backend doesn't have HydraulicState type
  check(project: unknown, calc: unknown): BackendRuleResult[];
}

export interface BackendComplianceReport {
  generatedAt: string;
  projectName: string;
  results: BackendRuleResult[];
  rulesChecked: Array<Pick<BackendRule, "id" | "name" | "category" | "severity" | "standardRef">>;
  summary: {
    passedRules: number;
    info: number;
    warn: number;
    error: number;
    critical: number;
    totalViolations: number;
  };
}

/* ─── Type guards ─────────────────────────────────────────────── */

interface MaybeNode { id?: string; kind?: string; label?: string; requiredPressure_mpa?: number }
interface MaybePipe {
  id?: string;
  fromNodeId?: string;
  toNodeId?: string;
  circuit?: string;
  dn?: number;
  length_m?: number;
}
interface MaybeProject {
  nodes?: MaybeNode[];
  pipes?: MaybePipe[];
  settings?: {
    titleBlock?: { drawingTitle?: string };
    temperatureScheduleKey?: string;
    minSupplyTemp_c?: number;
    tsg_obr_c?: number;
    printScale?: string;
    printPaperSize?: string;
    printOrientation?: string;
  };
}
interface MaybeCalc {
  pipes?: Array<{
    pipeId: string;
    G_kg_s?: number;
    v_m_s?: number;
    Re?: number;
    headlossPerMeter_pa?: number;
    heatLossPerMeter_W?: number;
  }>;
  nodes?: Array<{
    nodeId: string;
    pressureAtNode_mpa?: number;
    supplyTemp_C_at_inlet?: number;
  }>;
  pump?: { H_m: number; Q_m3h: number; P_kW: number };
}

function isConsumerKind(kind: string | undefined): boolean {
  return typeof kind === "string" && (kind.startsWith("consumer_") || kind === "consumer");
}
function isSourceKind(kind: string | undefined): boolean {
  return typeof kind === "string" && (kind.startsWith("source_") || kind === "source");
}
function pipeResult(calc: MaybeCalc | undefined | null, pipeId: string) {
  return calc?.pipes?.find((p) => p.pipeId === pipeId) ?? null;
}
function nodeResult(calc: MaybeCalc | undefined | null, nodeId: string) {
  return calc?.nodes?.find((n) => n.nodeId === nodeId) ?? null;
}

/* ─── Constants (mirror frontend) ─────────────────────────────── */

const VELOCITY_MAX_MAIN_MS = 3.5;
const PRESSURE_LOSS_MAX_PA_M = 80;
const CONSUMER_DP_MIN_MPA = 0.15;
const CONSUMER_SUPPLY_TEMP_MIN_C = 80;
const STANDARD_DN_MM = new Set([15, 20, 25, 32, 40, 50, 65, 80, 100, 125, 150, 200, 250, 300]);

/* ─── Rules ───────────────────────────────────────────────────── */
/*
 * For brevity, this backend port ships a MINIMUM-VIABLE 8-rule
 * subset (Phase 9.1 core) — same ids + severities + standard refs
 * as the frontend, easier to maintain. Full 30-rule parity can be
 * shipped in a follow-up that extracts to a shared package.
 */

export const ALL_RULES_BACKEND: ReadonlyArray<BackendRule> = [
  {
    id: "velocity_max_supply",
    category: "hydraulics",
    severity: "error",
    name: "Нийлүүлэх хоолойн хурд",
    description: "Магистрал нийлүүлэх хоолой v ≤ 3.5 м/с (БНбД 41-02-13 §6.2.5).",
    standardRef: "БНбД 41-02-13 §6.2.5",
    check(rawProject, rawCalc) {
      const project = rawProject as MaybeProject;
      const calc = rawCalc as MaybeCalc | undefined;
      const out: BackendRuleResult[] = [];
      for (const pipe of project.pipes ?? []) {
        if (pipe.circuit !== "heating_supply" || !pipe.id) continue;
        const pr = pipeResult(calc, pipe.id);
        if (!pr || typeof pr.v_m_s !== "number") continue;
        if (pr.v_m_s > VELOCITY_MAX_MAIN_MS) {
          out.push({
            ruleId: "velocity_max_supply",
            severity: "error",
            message: `Хоолой v = ${pr.v_m_s.toFixed(2)} м/с > ${VELOCITY_MAX_MAIN_MS} м/с`,
            entityType: "pipe",
            entityId: pipe.id,
            fixHint: "DN ахиулах эсвэл салбарлуулах",
          });
        }
      }
      return out;
    },
  },
  {
    id: "velocity_max_return",
    category: "hydraulics",
    severity: "error",
    name: "Эргэх хоолойн хурд",
    description: "Эргэх хоолой v ≤ 3.5 м/с.",
    standardRef: "БНбД 41-02-13 §6.2.5",
    check(rawProject, rawCalc) {
      const project = rawProject as MaybeProject;
      const calc = rawCalc as MaybeCalc | undefined;
      const out: BackendRuleResult[] = [];
      for (const pipe of project.pipes ?? []) {
        if (pipe.circuit !== "heating_return" || !pipe.id) continue;
        const pr = pipeResult(calc, pipe.id);
        if (!pr || typeof pr.v_m_s !== "number") continue;
        if (pr.v_m_s > VELOCITY_MAX_MAIN_MS) {
          out.push({
            ruleId: "velocity_max_return",
            severity: "error",
            message: `Эргэх хоолой v = ${pr.v_m_s.toFixed(2)} м/с > ${VELOCITY_MAX_MAIN_MS} м/с`,
            entityType: "pipe",
            entityId: pipe.id,
            fixHint: "DN ахиулах",
          });
        }
      }
      return out;
    },
  },
  {
    id: "pressure_loss_max",
    category: "hydraulics",
    severity: "warn",
    name: "Хувийн даралтын алдагдал",
    description: "R ≤ 80 Pa/m.",
    standardRef: "БНбД 41-02-13 §6.3.4 / СП 124.13330.2012 §10.6",
    check(rawProject, rawCalc) {
      const project = rawProject as MaybeProject;
      const calc = rawCalc as MaybeCalc | undefined;
      const out: BackendRuleResult[] = [];
      for (const pipe of project.pipes ?? []) {
        if (!pipe.id) continue;
        const pr = pipeResult(calc, pipe.id);
        if (!pr || typeof pr.headlossPerMeter_pa !== "number") continue;
        if (pr.headlossPerMeter_pa > PRESSURE_LOSS_MAX_PA_M) {
          out.push({
            ruleId: "pressure_loss_max",
            severity: "warn",
            message: `R = ${pr.headlossPerMeter_pa.toFixed(0)} Pa/m > ${PRESSURE_LOSS_MAX_PA_M}`,
            entityType: "pipe",
            entityId: pipe.id,
            fixHint: "DN ахиулах",
          });
        }
      }
      return out;
    },
  },
  {
    id: "consumer_pressure_min",
    category: "hydraulics",
    severity: "critical",
    name: "Хэрэглэгчийн доод даралт",
    description: "Δp ≥ 0.15 МПа.",
    standardRef: "БНбД 41-02-13 §7.1.8",
    check(rawProject, rawCalc) {
      const project = rawProject as MaybeProject;
      const calc = rawCalc as MaybeCalc | undefined;
      const out: BackendRuleResult[] = [];
      for (const node of project.nodes ?? []) {
        if (!isConsumerKind(node.kind) || !node.id) continue;
        const nr = nodeResult(calc, node.id);
        if (!nr || typeof nr.pressureAtNode_mpa !== "number") continue;
        const required = node.requiredPressure_mpa ?? CONSUMER_DP_MIN_MPA;
        if (nr.pressureAtNode_mpa < required) {
          out.push({
            ruleId: "consumer_pressure_min",
            severity: "critical",
            message: `"${node.label ?? node.id}" даралт ${nr.pressureAtNode_mpa.toFixed(3)} МПа < ${required} МПа`,
            entityType: "node",
            entityId: node.id,
            fixHint: "Магистрал DN ахиулах эсвэл насос H өсгөх",
          });
        }
      }
      return out;
    },
  },
  {
    id: "supply_temp_min",
    category: "thermal",
    severity: "warn",
    name: "Хэрэглэгчийн нийлүүлэх t°",
    description: "T ≥ 80°C.",
    standardRef: "БНбД 41-01-2019 §5.4",
    check(rawProject, rawCalc) {
      const project = rawProject as MaybeProject;
      const calc = rawCalc as MaybeCalc | undefined;
      const out: BackendRuleResult[] = [];
      const minTemp = project.settings?.minSupplyTemp_c ?? CONSUMER_SUPPLY_TEMP_MIN_C;
      for (const node of project.nodes ?? []) {
        if (!isConsumerKind(node.kind) || !node.id) continue;
        const nr = nodeResult(calc, node.id);
        if (!nr || typeof nr.supplyTemp_C_at_inlet !== "number") continue;
        if (nr.supplyTemp_C_at_inlet < minTemp) {
          out.push({
            ruleId: "supply_temp_min",
            severity: "warn",
            message: `"${node.label ?? node.id}" t° = ${nr.supplyTemp_C_at_inlet.toFixed(1)}°C < ${minTemp}°C`,
            entityType: "node",
            entityId: node.id,
            fixHint: "Магистрал дулаалга нэмэх, DN ахиулах",
          });
        }
      }
      return out;
    },
  },
  {
    id: "pipe_dn_minimum",
    category: "materials",
    severity: "info",
    name: "Стандарт DN",
    description: "DN ∈ стандарт хэмжээ.",
    standardRef: "ГОСТ 8732 / ISO 4200",
    check(rawProject) {
      const project = rawProject as MaybeProject;
      const out: BackendRuleResult[] = [];
      for (const pipe of project.pipes ?? []) {
        if (!pipe.id || typeof pipe.dn !== "number") continue;
        if (!STANDARD_DN_MM.has(pipe.dn)) {
          out.push({
            ruleId: "pipe_dn_minimum",
            severity: "info",
            message: `Хоолой DN${pipe.dn} нь стандарт хэмжээ биш`,
            entityType: "pipe",
            entityId: pipe.id,
            fixHint: "DN 15/20/25/32/40/50/65/80/100/125/150/200/250/300 сонгох",
          });
        }
      }
      return out;
    },
  },
  {
    id: "source_node_exists",
    category: "project",
    severity: "critical",
    name: "Эх үүсвэр зайлшгүй",
    description: "≥ 1 source node.",
    standardRef: "БНбД 41-02-13 §4.1",
    check(rawProject) {
      const project = rawProject as MaybeProject;
      const sourceCount = (project.nodes ?? []).filter((n) => isSourceKind(n.kind)).length;
      if (sourceCount === 0) {
        return [{
          ruleId: "source_node_exists",
          severity: "critical" as RuleSeverity,
          message: "Сүлжээнд эх үүсвэр (source_*) байхгүй",
          entityType: "project" as const,
          fixHint: "ЦТП / ТЭЦ / Зуух нэмж тавих",
        }];
      }
      return [];
    },
  },
  {
    id: "consumer_node_exists",
    category: "project",
    severity: "error",
    name: "Хэрэглэгч зайлшгүй",
    description: "≥ 1 consumer.",
    standardRef: "БНбД 41-02-13 §4.1",
    check(rawProject) {
      const project = rawProject as MaybeProject;
      const consumerCount = (project.nodes ?? []).filter((n) => isConsumerKind(n.kind)).length;
      if (consumerCount === 0) {
        return [{
          ruleId: "consumer_node_exists",
          severity: "error" as RuleSeverity,
          message: "Сүлжээнд хэрэглэгч (consumer_*) байхгүй",
          entityType: "project" as const,
          fixHint: "АОС / АОЭ / АОБ нэмж тавих",
        }];
      }
      return [];
    },
  },
];

/* ─── Engine ──────────────────────────────────────────────────── */

const SEVERITY_ORDER: Record<RuleSeverity, number> = {
  critical: 0,
  error: 1,
  warn: 2,
  info: 3,
};

export function runComplianceCheckBackend(
  project: unknown,
  calc: unknown,
  rules: ReadonlyArray<BackendRule> = ALL_RULES_BACKEND,
): BackendComplianceReport {
  const results: BackendRuleResult[] = [];
  let passedRules = 0;
  for (const rule of rules) {
    let perRule: BackendRuleResult[];
    try {
      perRule = rule.check(project, calc);
    } catch (err) {
      perRule = [{
        ruleId: rule.id,
        severity: "info",
        message: `Дотоод алдаа: ${err instanceof Error ? err.message : String(err)}`,
        entityType: "project",
      }];
    }
    if (perRule.length === 0) passedRules += 1;
    else results.push(...perRule);
  }
  results.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
  let info = 0, warn = 0, error = 0, critical = 0;
  for (const r of results) {
    if (r.severity === "info") info += 1;
    else if (r.severity === "warn") warn += 1;
    else if (r.severity === "error") error += 1;
    else if (r.severity === "critical") critical += 1;
  }
  const projectName = (project as MaybeProject)?.settings?.titleBlock?.drawingTitle ?? "";
  return {
    generatedAt: new Date().toISOString(),
    projectName,
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
}
