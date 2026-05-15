/**
 * Phase 9.1 — Compliance rule registry (initial 8 rules).
 *
 * Each rule is self-contained: id + metadata + a pure `check`
 * function. Rules are flat (no nested trees) and engineer-triggered
 * (not on-every-change). Standard refs cite БНбД 41-02-13,
 * БНбД 41-01-2019, and СП 124.13330.2012 where applicable.
 *
 * Phase 9.2 + 9.3 will add 12 + 10 more rules. Phase 11 polish
 * could add per-project rule customization (engineer disables
 * specific rules per project).
 *
 * Mongolian engineering convention notes:
 *   - Velocity hard limit 3.5 m/s comes from СП 124.13330.2012 §6.2.5
 *     (and is replicated in БНбД 41-02-13). Above this, noise +
 *     erosion become engineering concerns.
 *   - Pressure-loss soft limit 80 Pa/m is the economic-optimum
 *     ceiling; above it the pump grows faster than the savings on
 *     a smaller diameter, so it's a WARN not an ERROR.
 *   - Consumer Δp ≥ 0.15 MPa is the БНбД 41-02-13 §7.1.8 floor; below
 *     it the ITP exchanger can't draw enough flow → cold radiators.
 *     This is the only CRITICAL we ship in 9.1 because it directly
 *     translates to comfort failure in the home.
 *   - Supply temp ≥ 80°C at consumer is the БНбД 41-01-2019 §5.4 floor
 *     (Mongolian winter design). Below it the radiator surface area
 *     is undersized for the calc, so it's a WARN not an ERROR (the
 *     project still ships, but engineer should review insulation).
 */
import {
  type Rule,
  type RuleResult,
  isConsumerKind,
  isSourceKind,
  pipeResult,
  nodeResult,
} from "./ruleEngine";

/* ─── Constants (mirror Phase 5 NORM_THRESHOLDS) ─────────────────── */

const VELOCITY_MAX_MAIN_MS = 3.5;
const VELOCITY_MAX_BRANCH_MS = 2.0;
const VELOCITY_MIN_MS = 0.2;
const PRESSURE_LOSS_MAX_PA_M = 80;
const CONSUMER_DP_MIN_MPA = 0.15;
const CONSUMER_SUPPLY_TEMP_MIN_C = 80;

/**
 * Standard DN sizes per Mongolian / Russian / ISO drafting practice.
 * Anything outside this set is "non-standard" and the engineer should
 * confirm they really meant DN 47 (or whatever).
 */
const STANDARD_DN_MM = new Set([15, 20, 25, 32, 40, 50, 65, 80, 100, 125, 150, 200, 250, 300]);

/* ─── Rule 1: velocity_max_supply ──────────────────────────────── */

const velocityMaxSupply: Rule = {
  id: "velocity_max_supply",
  category: "hydraulics",
  severity: "error",
  name: "Нийлүүлэх хоолойн хурд",
  description: "Магистрал нийлүүлэх хоолой дахь усны хурд ≤ 3.5 м/с байх ёстой (БНбД 41-02-13 §6.2.5).",
  standardRef: "БНбД 41-02-13 §6.2.5",
  check(project, calc) {
    const out: RuleResult[] = [];
    for (const pipe of project.pipes) {
      if (pipe.circuit !== "heating_supply") continue;
      const pr = pipeResult(calc, pipe.id);
      if (!pr) continue;
      if (pr.v_m_s > VELOCITY_MAX_MAIN_MS) {
        out.push({
          ruleId: "velocity_max_supply",
          severity: "error",
          message: `Хоолой v = ${pr.v_m_s.toFixed(2)} м/с > ${VELOCITY_MAX_MAIN_MS} м/с хязгаар`,
          entityType: "pipe",
          entityId: pipe.id,
          fixHint: "Диаметр (DN) ахиулах эсвэл шугам салаа болгох",
        });
      }
    }
    return out;
  },
};

/* ─── Rule 2: velocity_max_return ──────────────────────────────── */

const velocityMaxReturn: Rule = {
  id: "velocity_max_return",
  category: "hydraulics",
  severity: "error",
  name: "Эргэх хоолойн хурд",
  description: "Магистрал эргэх хоолой дахь усны хурд ≤ 3.5 м/с байх ёстой.",
  standardRef: "БНбД 41-02-13 §6.2.5",
  check(project, calc) {
    const out: RuleResult[] = [];
    for (const pipe of project.pipes) {
      if (pipe.circuit !== "heating_return") continue;
      const pr = pipeResult(calc, pipe.id);
      if (!pr) continue;
      if (pr.v_m_s > VELOCITY_MAX_MAIN_MS) {
        out.push({
          ruleId: "velocity_max_return",
          severity: "error",
          message: `Эргэх хоолой v = ${pr.v_m_s.toFixed(2)} м/с > ${VELOCITY_MAX_MAIN_MS} м/с`,
          entityType: "pipe",
          entityId: pipe.id,
          fixHint: "Диаметр (DN) ахиулах",
        });
      }
    }
    return out;
  },
};

/* ─── Rule 3: pressure_loss_max ────────────────────────────────── */

const pressureLossMax: Rule = {
  id: "pressure_loss_max",
  category: "hydraulics",
  severity: "warn",
  name: "Хувийн даралтын алдагдал",
  description: "Хоолой бүрд хувийн даралтын алдагдал R ≤ 80 Па/м (эдийн засгийн оновчтой хязгаар).",
  standardRef: "БНбД 41-02-13 §6.3.4 / СП 124.13330.2012 §10.6",
  check(project, calc) {
    const out: RuleResult[] = [];
    for (const pipe of project.pipes) {
      const pr = pipeResult(calc, pipe.id);
      if (!pr) continue;
      if (pr.headlossPerMeter_pa > PRESSURE_LOSS_MAX_PA_M) {
        out.push({
          ruleId: "pressure_loss_max",
          severity: "warn",
          message: `R = ${pr.headlossPerMeter_pa.toFixed(0)} Pa/m > ${PRESSURE_LOSS_MAX_PA_M} Pa/m`,
          entityType: "pipe",
          entityId: pipe.id,
          fixHint: "Диаметрийг нэг хэмжээ ахиулах",
        });
      }
    }
    return out;
  },
};

/* ─── Rule 4: consumer_pressure_min ────────────────────────────── */

const consumerPressureMin: Rule = {
  id: "consumer_pressure_min",
  category: "hydraulics",
  severity: "critical",
  name: "Хэрэглэгчийн доод даралт",
  description: "Хэрэглэгч дээрх ажлын даралт Δp ≥ 0.15 МПа (ИТП хувиарлуулагч ажиллах хамгийн бага).",
  standardRef: "БНбД 41-02-13 §7.1.8",
  check(project, calc) {
    const out: RuleResult[] = [];
    for (const node of project.nodes) {
      if (!isConsumerKind(node.kind)) continue;
      const nr = nodeResult(calc, node.id);
      if (!nr) continue;
      const required = node.requiredPressure_mpa ?? CONSUMER_DP_MIN_MPA;
      if (nr.pressureAtNode_mpa < required) {
        out.push({
          ruleId: "consumer_pressure_min",
          severity: "critical",
          message: `"${node.label}" даралт ${nr.pressureAtNode_mpa.toFixed(3)} МПа < ${required} МПа шаардлагатай`,
          entityType: "node",
          entityId: node.id,
          fixHint: "Магистрал DN ахиулах, насосны H өсгөх, эсвэл салаа дахин зурах",
        });
      }
    }
    return out;
  },
};

/* ─── Rule 5: supply_temp_min ──────────────────────────────────── */

const supplyTempMin: Rule = {
  id: "supply_temp_min",
  category: "thermal",
  severity: "warn",
  name: "Хэрэглэгчийн нийлүүлэх t°",
  description: "Хэрэглэгч дээрх нийлүүлэх ус ≥ 80°C байх ёстой (БНбД 41-01-2019 §5.4).",
  standardRef: "БНбД 41-01-2019 §5.4",
  check(project, calc) {
    const out: RuleResult[] = [];
    const minTemp = project.settings.minSupplyTemp_c ?? CONSUMER_SUPPLY_TEMP_MIN_C;
    for (const node of project.nodes) {
      if (!isConsumerKind(node.kind)) continue;
      const nr = nodeResult(calc, node.id);
      if (!nr) continue;
      if (typeof nr.supplyTemp_C_at_inlet === "number" && nr.supplyTemp_C_at_inlet < minTemp) {
        out.push({
          ruleId: "supply_temp_min",
          severity: "warn",
          message: `"${node.label}" нийлүүлэх t° = ${nr.supplyTemp_C_at_inlet.toFixed(1)}°C < ${minTemp}°C`,
          entityType: "node",
          entityId: node.id,
          fixHint: "Магистрал дулаалга нэмэх, DN ахиулах, эсвэл tsg_pod_c-ийг шалгах",
        });
      }
    }
    return out;
  },
};

/* ─── Rule 6: pipe_dn_minimum ─────────────────────────────────── */

const pipeDnMinimum: Rule = {
  id: "pipe_dn_minimum",
  category: "materials",
  severity: "info",
  name: "Стандарт DN ашиглах",
  description: "Хоолойн диаметр стандарт хэмжээнээс сонгох (DN 15/20/25/32/40/50/65/80/100/125/150/200/250/300).",
  standardRef: "ГОСТ 8732 / ISO 4200",
  check(project) {
    const out: RuleResult[] = [];
    for (const pipe of project.pipes) {
      if (!STANDARD_DN_MM.has(pipe.dn)) {
        out.push({
          ruleId: "pipe_dn_minimum",
          severity: "info",
          message: `Хоолой DN${pipe.dn} нь стандарт хэмжээ биш`,
          entityType: "pipe",
          entityId: pipe.id,
          fixHint: "Стандарт хэмжээний DN сонгох (15/20/25/32/40/50/65/80/100/125/150/200/250/300)",
        });
      }
    }
    return out;
  },
};

/* ─── Rule 7: source_node_exists ──────────────────────────────── */

const sourceNodeExists: Rule = {
  id: "source_node_exists",
  category: "project",
  severity: "critical",
  name: "Эх үүсвэр зайлшгүй",
  description: "Төсөл багадаа нэг эх үүсвэртэй (ЦТП / ТЭЦ / Зуух / Геотермал) байх ёстой.",
  standardRef: "БНбД 41-02-13 §4.1",
  check(project) {
    const sourceCount = project.nodes.filter((n) => isSourceKind(n.kind)).length;
    if (sourceCount === 0) {
      return [{
        ruleId: "source_node_exists",
        severity: "critical",
        message: "Сүлжээнд эх үүсвэр (source_*) байхгүй байна",
        entityType: "project",
        fixHint: "ЦТП / ТЭЦ / Зуух нэмж тавина уу",
      }];
    }
    return [];
  },
};

/* ─── Rule 8: consumer_node_exists ────────────────────────────── */

const consumerNodeExists: Rule = {
  id: "consumer_node_exists",
  category: "project",
  severity: "error",
  name: "Хэрэглэгч зайлшгүй",
  description: "Төсөл багадаа нэг хэрэглэгчтэй (АОС / АОЭ / АОБ) байх ёстой.",
  standardRef: "БНбД 41-02-13 §4.1",
  check(project) {
    const consumerCount = project.nodes.filter((n) => isConsumerKind(n.kind)).length;
    if (consumerCount === 0) {
      return [{
        ruleId: "consumer_node_exists",
        severity: "error",
        message: "Сүлжээнд хэрэглэгч (consumer_*) байхгүй байна",
        entityType: "project",
        fixHint: "АОС / АОЭ / АОБ нэмж тавина уу",
      }];
    }
    return [];
  },
};

/* ─── Registry export ─────────────────────────────────────────── */

/**
 * Phase 9.1 — initial 8 rules. Phase 9.2 + 9.3 append to this list.
 * Order doesn't affect behaviour (the engine sorts by severity), but
 * it's grouped by category for readability.
 */
export const ALL_RULES: ReadonlyArray<Rule> = [
  // Hydraulics
  velocityMaxSupply,
  velocityMaxReturn,
  pressureLossMax,
  consumerPressureMin,
  // Thermal
  supplyTempMin,
  // Materials
  pipeDnMinimum,
  // Project
  sourceNodeExists,
  consumerNodeExists,
];

/** Constants re-exported for tests + future rule implementations. */
export const COMPLIANCE_CONSTANTS = {
  VELOCITY_MAX_MAIN_MS,
  VELOCITY_MAX_BRANCH_MS,
  VELOCITY_MIN_MS,
  PRESSURE_LOSS_MAX_PA_M,
  CONSUMER_DP_MIN_MPA,
  CONSUMER_SUPPLY_TEMP_MIN_C,
  STANDARD_DN_MM,
} as const;
