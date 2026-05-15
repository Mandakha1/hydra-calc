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
// Phase 12.12 — channel-aware compliance rules.
import { CHANNEL_RULES } from "./channelRules";

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

/* ───────────────────────────────────────────────────────────────────
   PHASE 9.2 — Extended hydraulic + thermal rules (rules 9-20)
   ─────────────────────────────────────────────────────────────────── */

const REYNOLDS_TURBULENT = 4000;
const RETURN_TEMP_MAX_C = 70;
const TEMP_DROP_MIN_C = 20;
const HEAT_LOSS_PER_METER_MAX_W = 50;
const PUMP_HEAD_MAX_M = 60;
const PUMP_EFFICIENCY_MIN = 0.6;
const CIRCUIT_BALANCE_TOLERANCE = 0.05; // 5% mass-flow imbalance
const BRANCH_LENGTH_MAX_M = 200;

/** Minimum insulation thickness per DN range — Mongolian convention.
 *  DN ≤ 50: 30mm; DN 65-100: 40mm; DN > 100: 50mm. */
function minInsulationMm(dn: number): number {
  if (dn <= 50) return 30;
  if (dn <= 100) return 40;
  return 50;
}

/* ─── Rule 9: velocity_min_supply ─────────────────────────────── */

const velocityMinSupply: Rule = {
  id: "velocity_min_supply",
  category: "hydraulics",
  severity: "info",
  name: "Хоолойн доод хурд",
  description: "Хоолой v ≥ 0.3 м/с байх ёстой — доорх хурдтай бол лай бөглөрөх эрсдэлтэй.",
  standardRef: "СП 124.13330.2012 §6.2.6",
  check(project, calc) {
    const out: RuleResult[] = [];
    for (const pipe of project.pipes) {
      const pr = pipeResult(calc, pipe.id);
      if (!pr) continue;
      // Don't flag near-zero pipes (sensor / instrument runs).
      if (pr.G_kg_s < 0.01) continue;
      if (pr.v_m_s > 0 && pr.v_m_s < 0.3) {
        out.push({
          ruleId: "velocity_min_supply",
          severity: "info",
          message: `v = ${pr.v_m_s.toFixed(3)} м/с < 0.3 м/с (лай хуримтлах эрсдэл)`,
          entityType: "pipe",
          entityId: pipe.id,
          fixHint: "Хоолойны DN-ийг бууруулах эсвэл оёлдол шалгах",
        });
      }
    }
    return out;
  },
};

/* ─── Rule 10: reynolds_min ────────────────────────────────────── */

const reynoldsMin: Rule = {
  id: "reynolds_min",
  category: "hydraulics",
  severity: "info",
  name: "Reynolds-ийн тоо",
  description: "Re ≥ 4000 (турбулент урсгал) байх нь Darcy-Weisbach тооцооны үндэс.",
  standardRef: "СП 124.13330.2012 §10.4",
  check(project, calc) {
    const out: RuleResult[] = [];
    for (const pipe of project.pipes) {
      const pr = pipeResult(calc, pipe.id);
      if (!pr) continue;
      if (pr.G_kg_s < 0.01) continue;
      if (pr.Re > 0 && pr.Re < REYNOLDS_TURBULENT) {
        out.push({
          ruleId: "reynolds_min",
          severity: "info",
          message: `Re = ${pr.Re.toFixed(0)} < 4000 (шилжилтийн / ламинар горим)`,
          entityType: "pipe",
          entityId: pipe.id,
          fixHint: "Хурд бага байгааг шалгах эсвэл DN бууруулах",
        });
      }
    }
    return out;
  },
};

/* ─── Rule 11: return_temp_max ─────────────────────────────────── */

const returnTempMax: Rule = {
  id: "return_temp_max",
  category: "thermal",
  severity: "warn",
  name: "Эргэх ус t°",
  description: "Эргэх усны температур ≤ 70°C байх нь ТЭЦ-ийн үр ашигт чухал.",
  standardRef: "БНбД 41-01-2019 §5.3",
  check(project) {
    // Design return temp comes from the temperature schedule. When
    // it exceeds 70°C, project is using a wrong schedule for
    // residential district heating.
    const scheduleKey = project.settings.temperatureScheduleKey ?? "130_70";
    // Parse the schedule key like "130_70" → return = 70
    const parts = scheduleKey.split("_");
    const returnC = parts.length === 2 ? Number(parts[1]) : NaN;
    // Also check seasonal mean return if engineer entered it directly
    const seasonalReturnC = project.settings.tsg_obr_c;
    const out: RuleResult[] = [];
    if (Number.isFinite(returnC) && returnC > RETURN_TEMP_MAX_C) {
      out.push({
        ruleId: "return_temp_max",
        severity: "warn",
        message: `Тооцооны эргэх t° = ${returnC}°C > ${RETURN_TEMP_MAX_C}°C`,
        entityType: "project",
        fixHint: "130/70 эсвэл 95/70 график руу шилжих",
      });
    }
    if (typeof seasonalReturnC === "number" && seasonalReturnC > RETURN_TEMP_MAX_C) {
      out.push({
        ruleId: "return_temp_max",
        severity: "warn",
        message: `Улирлын дундаж эргэх t° = ${seasonalReturnC}°C > ${RETURN_TEMP_MAX_C}°C`,
        entityType: "project",
        fixHint: "Эргэх ус илүү хүйтэн байх ёстой — ИТП тохиргоо шалгах",
      });
    }
    return out;
  },
};

/* ─── Rule 12: temp_drop_min ───────────────────────────────────── */

const tempDropMin: Rule = {
  id: "temp_drop_min",
  category: "thermal",
  severity: "info",
  name: "Темпийн ялгаа Δt",
  description: "Нийлүүлэх - эргэх ялгаа ≥ 20°C байх — бага бол насос илүү хүчтэй ажиллана.",
  standardRef: "БНбД 41-01-2019 §5.2",
  check(project) {
    const scheduleKey = project.settings.temperatureScheduleKey ?? "130_70";
    const parts = scheduleKey.split("_").map(Number);
    if (parts.length !== 2 || parts.some((n) => !Number.isFinite(n))) return [];
    const dt = parts[0]! - parts[1]!;
    if (dt < TEMP_DROP_MIN_C) {
      return [{
        ruleId: "temp_drop_min",
        severity: "info",
        message: `Δt = ${dt}°C < ${TEMP_DROP_MIN_C}°C (бага температурын ялгаа)`,
        entityType: "project",
        fixHint: "130/70 эсвэл 95/70 график руу шилжих",
      }];
    }
    return [];
  },
};

/* ─── Rule 13: heat_loss_per_meter_max ─────────────────────────── */

const heatLossPerMeterMax: Rule = {
  id: "heat_loss_per_meter_max",
  category: "thermal",
  severity: "warn",
  name: "Дулааны алдагдал/м",
  description: "Изоляцитай хоолойн дулаалгын алдагдал ≤ 50 Вт/м.",
  standardRef: "БНбД 41-01-2019 §6.4",
  check(project, calc) {
    const out: RuleResult[] = [];
    for (const pipe of project.pipes) {
      const pr = pipeResult(calc, pipe.id);
      if (!pr) continue;
      const loss = pr.heatLossPerMeter_W;
      if (typeof loss === "number" && loss > HEAT_LOSS_PER_METER_MAX_W) {
        out.push({
          ruleId: "heat_loss_per_meter_max",
          severity: "warn",
          message: `q' = ${loss.toFixed(1)} Вт/м > ${HEAT_LOSS_PER_METER_MAX_W} Вт/м`,
          entityType: "pipe",
          entityId: pipe.id,
          fixHint: "Дулаалгын зузаан нэмэх эсвэл материал сольж шалгах",
        });
      }
    }
    return out;
  },
};

/* ─── Rule 14: pump_head_reasonable ───────────────────────────── */

const pumpHeadReasonable: Rule = {
  id: "pump_head_reasonable",
  category: "hydraulics",
  severity: "warn",
  name: "Насосны H (баруун хязгаар)",
  description: "Тооцоологдсон насос H ≤ 60 м — өндөр бол ИТП-руу даралт давах эрсдэл.",
  standardRef: "БНбД 41-02-13 §8.2",
  check(_project, calc) {
    if (!calc?.pump) return [];
    if (calc.pump.H_m > PUMP_HEAD_MAX_M) {
      return [{
        ruleId: "pump_head_reasonable",
        severity: "warn",
        message: `Насос H = ${calc.pump.H_m.toFixed(1)} м > ${PUMP_HEAD_MAX_M} м`,
        entityType: "project",
        fixHint: "Магистрал DN-уудыг ахиулж даралтын алдагдал бууруулах",
      }];
    }
    return [];
  },
};

/* ─── Rule 15: pump_efficiency_min ────────────────────────────── */

const pumpEfficiencyMin: Rule = {
  id: "pump_efficiency_min",
  category: "hydraulics",
  severity: "info",
  name: "Насосны үр ашиг η",
  description: "Сонгох насос η ≥ 0.6 байх — бага үр ашигт цахилгаан хэт зарцуулна.",
  standardRef: "БНбД 41-02-13 §8.5",
  check(_project, calc) {
    if (!calc?.pump?.breakdown) return [];
    // Estimate η from H + Q + P: η = ρ·g·Q·H / P
    const Q_m3s = calc.pump.Q_m3h / 3600;
    const ideal_kW = (1000 * 9.81 * Q_m3s * calc.pump.H_m) / 1000;
    if (calc.pump.P_kW > 0 && ideal_kW > 0) {
      const eta = ideal_kW / calc.pump.P_kW;
      if (eta > 0 && eta < PUMP_EFFICIENCY_MIN) {
        return [{
          ruleId: "pump_efficiency_min",
          severity: "info",
          message: `Насосны η ≈ ${(eta * 100).toFixed(0)}% < ${(PUMP_EFFICIENCY_MIN * 100).toFixed(0)}%`,
          entityType: "project",
          fixHint: "Илүү өндөр үр ашигтай насос сонгох",
        }];
      }
    }
    return [];
  },
};

/* ─── Rule 16: circuit_balance ─────────────────────────────────── */

const circuitBalance: Rule = {
  id: "circuit_balance",
  category: "hydraulics",
  severity: "warn",
  name: "Хэлхээний тэнцэл",
  description: "Нийлүүлэх ба эргэх массын урсгал ялгаа < 5% байх — мэдэгдэхүйц алдагдал илрэх дохио.",
  standardRef: "БНбД 41-02-13 §6.1",
  check(project, calc) {
    if (!calc) return [];
    let supplyFlow = 0, returnFlow = 0;
    for (const pipe of project.pipes) {
      const pr = pipeResult(calc, pipe.id);
      if (!pr) continue;
      if (pipe.circuit === "heating_supply") supplyFlow += pr.G_kg_s;
      else if (pipe.circuit === "heating_return") returnFlow += pr.G_kg_s;
    }
    // Need BOTH circuits to compare. If only supply pipes exist, skip
    // (e.g. Bayangol fixture).
    if (supplyFlow <= 0 || returnFlow <= 0) return [];
    const imbalance = Math.abs(supplyFlow - returnFlow) / supplyFlow;
    if (imbalance > CIRCUIT_BALANCE_TOLERANCE) {
      return [{
        ruleId: "circuit_balance",
        severity: "warn",
        message: `Нийлүүлэх vs эргэх урсгал ялгаа ${(imbalance * 100).toFixed(1)}% > 5%`,
        entityType: "project",
        fixHint: "Эргэх хоолой бүрэн загварчилсан эсэхийг шалгах",
      }];
    }
    return [];
  },
};

/* ─── Rule 17: pipe_length_max_branch ──────────────────────────── */

const pipeLengthMaxBranch: Rule = {
  id: "pipe_length_max_branch",
  category: "geometry",
  severity: "info",
  name: "Салаа хоолойн урт",
  description: "Дунд салаа хоолой ≤ 200 м — урт бол ИТП хувиарлуулагч хүрэхгүй болж магадгүй.",
  standardRef: "БНбД 41-02-13 §7.3",
  check(project) {
    const out: RuleResult[] = [];
    for (const pipe of project.pipes) {
      if (pipe.length_m > BRANCH_LENGTH_MAX_M) {
        out.push({
          ruleId: "pipe_length_max_branch",
          severity: "info",
          message: `Хоолой L = ${pipe.length_m.toFixed(0)} м > ${BRANCH_LENGTH_MAX_M} м`,
          entityType: "pipe",
          entityId: pipe.id,
          fixHint: "Дунд камер / худаг нэмэх, эсвэл ИТП хэлбэр өөрчлөх",
        });
      }
    }
    return out;
  },
};

/* ─── Rule 18: pipe_dn_decrease_along_flow ─────────────────────── */

const pipeDnDecreaseAlongFlow: Rule = {
  id: "pipe_dn_decrease_along_flow",
  category: "hydraulics",
  severity: "info",
  name: "DN-ийн чиглэл",
  description: "Урсгалын чиглэл дагуу DN зөвхөн буурах ёстой (антипатэрн илрүүлэх).",
  standardRef: "Engineering convention",
  check(project) {
    // Build adjacency from pipes; for each pipe, find downstream pipes
    // (sharing toNodeId as the next pipe's fromNodeId).
    const out: RuleResult[] = [];
    const pipeByFrom = new Map<string, typeof project.pipes>();
    for (const p of project.pipes) {
      const arr = pipeByFrom.get(p.fromNodeId) ?? [];
      arr.push(p);
      pipeByFrom.set(p.fromNodeId, arr);
    }
    for (const pipe of project.pipes) {
      const downstream = pipeByFrom.get(pipe.toNodeId) ?? [];
      for (const next of downstream) {
        if (next.dn > pipe.dn) {
          out.push({
            ruleId: "pipe_dn_decrease_along_flow",
            severity: "info",
            message: `DN${pipe.dn} → DN${next.dn} өсч байна (антипатэрн)`,
            entityType: "pipe",
            entityId: next.id,
            fixHint: "Урсгал чиглэлийг шалгах эсвэл DN-ийг буулгах",
          });
        }
      }
    }
    return out;
  },
};

/* ─── Rule 19: insulation_thickness_min ────────────────────────── */

const insulationThicknessMin: Rule = {
  id: "insulation_thickness_min",
  category: "materials",
  severity: "warn",
  name: "Дулаалгын зузаан",
  description: "DN ≤ 50 → 30мм; 65-100 → 40мм; > 100 → 50мм дулаалга хэрэгтэй.",
  standardRef: "БНбД 41-01-2019 §6.4 + ГОСТ 30732",
  check(project) {
    const out: RuleResult[] = [];
    const defaultThickness = project.settings.defaultInsulationThickness_mm;
    for (const pipe of project.pipes) {
      const thickness = pipe.insulationThickness_mm ?? defaultThickness;
      if (typeof thickness !== "number" || thickness <= 0) continue;
      const minRequired = minInsulationMm(pipe.dn);
      if (thickness < minRequired) {
        out.push({
          ruleId: "insulation_thickness_min",
          severity: "warn",
          message: `DN${pipe.dn} → дулаалга ${thickness}мм < ${minRequired}мм шаардлагатай`,
          entityType: "pipe",
          entityId: pipe.id,
          fixHint: "Дулаалгын зузаан нэмэх (ПИ-труба гэх мэт)",
        });
      }
    }
    return out;
  },
};

/* ─── Rule 20: pipe_material_consistent ───────────────────────── */

const pipeMaterialConsistent: Rule = {
  id: "pipe_material_consistent",
  category: "materials",
  severity: "info",
  name: "Хоолойн материал нэгдэл",
  description: "Хэлхээ нэг бүрд нэг материалын код хэрэглэх нь монтажыг хялбарчилна.",
  standardRef: "Engineering convention",
  check(project) {
    const byCircuit = new Map<string, Set<string>>();
    for (const pipe of project.pipes) {
      const c = pipe.circuit ?? "unknown";
      const set = byCircuit.get(c) ?? new Set<string>();
      set.add(pipe.materialKey);
      byCircuit.set(c, set);
    }
    const out: RuleResult[] = [];
    for (const [circuit, mats] of byCircuit.entries()) {
      if (mats.size > 1) {
        out.push({
          ruleId: "pipe_material_consistent",
          severity: "info",
          message: `"${circuit}" хэлхээнд ${mats.size} өөр материал байна: ${[...mats].join(", ")}`,
          entityType: "project",
          fixHint: "Хэлхээний материалыг нэгтгэх (steel_aged / PPR гэх мэт)",
        });
      }
    }
    return out;
  },
};

/* ───────────────────────────────────────────────────────────────────
   PHASE 9.3 — Geometric + project metadata rules (rules 21-30)
   ─────────────────────────────────────────────────────────────────── */

const FIXED_SUPPORT_SPACING_MAX_M = 50;     // straight-run support spacing
const COMPENSATOR_SPACING_MAX_M = 80;       // thermal expansion compensator
const CONSUMER_DISTANCE_MAX_M = 1000;       // far-consumer warning
const POINT_OVERLAP_TOL_PX = 1;             // overlap detection tolerance

function isFixedSupportKind(kind: string): boolean {
  return kind === "fixed_support" || kind.startsWith("fixed_support_");
}
function isCompensatorKind(kind: string): boolean {
  return kind === "compensator" || kind.startsWith("compensator_");
}
function isWellKind(kind: string): boolean {
  return kind === "well_supply" || kind === "well_drain" || kind === "chamber";
}

/** Build adjacency: nodeId → array of pipe ids touching that node. */
function buildAdjacency(pipes: ReadonlyArray<{ id: string; fromNodeId: string; toNodeId: string }>): Map<string, string[]> {
  const adj = new Map<string, string[]>();
  for (const p of pipes) {
    adj.set(p.fromNodeId, [...(adj.get(p.fromNodeId) ?? []), p.id]);
    adj.set(p.toNodeId, [...(adj.get(p.toNodeId) ?? []), p.id]);
  }
  return adj;
}

/**
 * Phase 11.3 — single-source Dijkstra. Returns a Map of
 * `node_id → shortest distance in metres` from `fromId` to every
 * reachable node. Used by `consumer_distance_to_source_max` rule
 * to avoid running Dijkstra per-consumer on 1000-node fixtures.
 *
 * Uses the same naive `queue.sort()` Dijkstra as
 * `shortestPathLength_m` below — O(V² log V), good enough for
 * Mongolian residential heating networks (≤ 5000 nodes typical).
 * A binary-heap rewrite would drop this to O((V+E) log V) but
 * adds 200 LOC for limited gain at our scale.
 */
function multiTargetShortestPath_m(
  fromId: string,
  pipes: ReadonlyArray<{ fromNodeId: string; toNodeId: string; length_m: number }>,
): Map<string, number> {
  const adj = new Map<string, Array<{ to: string; len: number }>>();
  for (const p of pipes) {
    adj.set(p.fromNodeId, [...(adj.get(p.fromNodeId) ?? []), { to: p.toNodeId, len: p.length_m }]);
    adj.set(p.toNodeId, [...(adj.get(p.toNodeId) ?? []), { to: p.fromNodeId, len: p.length_m }]);
  }
  const dist = new Map<string, number>([[fromId, 0]]);
  const queue: string[] = [fromId];
  while (queue.length > 0) {
    queue.sort((a, b) => (dist.get(a) ?? Infinity) - (dist.get(b) ?? Infinity));
    const cur = queue.shift()!;
    const curDist = dist.get(cur) ?? Infinity;
    for (const edge of adj.get(cur) ?? []) {
      const next = curDist + edge.len;
      if (next < (dist.get(edge.to) ?? Infinity)) {
        dist.set(edge.to, next);
        queue.push(edge.to);
      }
    }
  }
  return dist;
}

/** Cumulative path length from a source via BFS (shortest path
 *  in number-of-pipes terms, weighted by pipe.length_m).
 *  Phase 11.3 — retained for any external callers; the
 *  `consumer_distance_to_source_max` rule now uses
 *  `multiTargetShortestPath_m` directly. */
function shortestPathLength_m(
  fromId: string,
  toId: string,
  pipes: ReadonlyArray<{ fromNodeId: string; toNodeId: string; length_m: number }>,
): number | null {
  if (fromId === toId) return 0;
  // Dijkstra-like BFS (uniform-cost on length_m).
  const adj = new Map<string, Array<{ to: string; len: number }>>();
  for (const p of pipes) {
    adj.set(p.fromNodeId, [...(adj.get(p.fromNodeId) ?? []), { to: p.toNodeId, len: p.length_m }]);
    adj.set(p.toNodeId, [...(adj.get(p.toNodeId) ?? []), { to: p.fromNodeId, len: p.length_m }]);
  }
  const dist = new Map<string, number>([[fromId, 0]]);
  const queue: string[] = [fromId];
  while (queue.length > 0) {
    // Pick the node with min dist
    queue.sort((a, b) => (dist.get(a) ?? Infinity) - (dist.get(b) ?? Infinity));
    const cur = queue.shift()!;
    const curDist = dist.get(cur) ?? Infinity;
    for (const edge of adj.get(cur) ?? []) {
      const next = curDist + edge.len;
      if (next < (dist.get(edge.to) ?? Infinity)) {
        dist.set(edge.to, next);
        queue.push(edge.to);
      }
    }
  }
  return dist.get(toId) ?? null;
}

/* ─── Rule 21: fixed_support_spacing_max ──────────────────────── */

const fixedSupportSpacingMax: Rule = {
  id: "fixed_support_spacing_max",
  category: "geometry",
  severity: "warn",
  name: "Тогтмол тулгуурын зай",
  description: "Бэхэлгээ хоорондын зай 30-50 м-ээс хэтрэхгүй (БНбД 41-02-13 §8.4).",
  standardRef: "БНбД 41-02-13 §8.4",
  check(project) {
    const supportIds = new Set(project.nodes.filter((n) => isFixedSupportKind(n.kind)).map((n) => n.id));
    if (supportIds.size === 0 && project.pipes.length > 0) {
      // No supports at all — surface a single project-level warning.
      const totalLen = project.pipes.reduce((s, p) => s + p.length_m, 0);
      if (totalLen > FIXED_SUPPORT_SPACING_MAX_M) {
        return [{
          ruleId: "fixed_support_spacing_max",
          severity: "warn",
          message: `Сүлжээнд тогтмол тулгуур (fixed_support) байхгүй, нийт ${totalLen.toFixed(0)} м хоолой`,
          entityType: "project",
          fixHint: "Уртын ≥ 50 м-ийн интервалд тогтмол тулгуур нэмнэ",
        }];
      }
    }
    // Find straight runs without supports — flag pipes > 50m without a support endpoint.
    const out: RuleResult[] = [];
    for (const pipe of project.pipes) {
      if (pipe.length_m <= FIXED_SUPPORT_SPACING_MAX_M) continue;
      const hasSupport = supportIds.has(pipe.fromNodeId) || supportIds.has(pipe.toNodeId);
      if (!hasSupport) {
        out.push({
          ruleId: "fixed_support_spacing_max",
          severity: "warn",
          message: `Хоолой L = ${pipe.length_m.toFixed(0)} м > ${FIXED_SUPPORT_SPACING_MAX_M} м, тулгуургүй`,
          entityType: "pipe",
          entityId: pipe.id,
          fixHint: "Шугамын дунд тогтмол тулгуур (fixed_support_steel) тавих",
        });
      }
    }
    return out;
  },
};

/* ─── Rule 22: compensator_spacing_required ───────────────────── */

const compensatorSpacingRequired: Rule = {
  id: "compensator_spacing_required",
  category: "geometry",
  severity: "error",
  name: "Компенсатор зайтай",
  description: "Дулааны уртасгалт хариуцах компенсатор 60-80 м тутамд шаардлагатай.",
  standardRef: "СП 124.13330 §11.3 + БНбД 41-02-13",
  check(project) {
    const compensatorIds = new Set(project.nodes.filter((n) => isCompensatorKind(n.kind)).map((n) => n.id));
    const out: RuleResult[] = [];
    for (const pipe of project.pipes) {
      if (pipe.length_m <= COMPENSATOR_SPACING_MAX_M) continue;
      const hasComp = compensatorIds.has(pipe.fromNodeId) || compensatorIds.has(pipe.toNodeId);
      if (!hasComp) {
        out.push({
          ruleId: "compensator_spacing_required",
          severity: "error",
          message: `Хоолой L = ${pipe.length_m.toFixed(0)} м > ${COMPENSATOR_SPACING_MAX_M} м, компенсаторгүй`,
          entityType: "pipe",
          entityId: pipe.id,
          fixHint: "U-bend (compensator_u) эсвэл сильфон (compensator_bellow) нэмэх",
        });
      }
    }
    return out;
  },
};

/* ─── Rule 23: well_at_branches ───────────────────────────────── */

const wellAtBranches: Rule = {
  id: "well_at_branches",
  category: "geometry",
  severity: "warn",
  name: "Салбарлалт дээр худаг",
  description: "T-холболтод (3+ хоолой нийлэх) худаг буюу камер байх ёстой — засвар үйлчилгээ.",
  standardRef: "БНбД 41-02-13 §6.4",
  check(project) {
    const adj = buildAdjacency(project.pipes);
    const out: RuleResult[] = [];
    for (const node of project.nodes) {
      const pipeCount = adj.get(node.id)?.length ?? 0;
      if (pipeCount < 3) continue;
      // T-junction or higher
      if (!isWellKind(node.kind)) {
        out.push({
          ruleId: "well_at_branches",
          severity: "warn",
          message: `"${node.label}" (${pipeCount} хоолой нийлэх) худаг биш`,
          entityType: "node",
          entityId: node.id,
          fixHint: "Зангилаа төрөл болон 'well_supply' эсвэл 'chamber' болгох",
        });
      }
    }
    return out;
  },
};

/* ─── Rule 24: building_footprint_metadata ────────────────────── */

const buildingFootprintMetadata: Rule = {
  id: "building_footprint_metadata",
  category: "project",
  severity: "info",
  name: "Барилгын мэдээлэл",
  description: "Барилга тус бүр давхрын тоо + дулааны ачаалал бүртгэсэн байх ёстой.",
  standardRef: "ГОСТ 21.501 + Mongolian convention",
  check(project) {
    const out: RuleResult[] = [];
    for (const b of project.buildings ?? []) {
      const missing: string[] = [];
      if (typeof b.floors !== "number" || b.floors <= 0) missing.push("давхар");
      if (typeof b.heatLoad_kw !== "number" || b.heatLoad_kw <= 0) missing.push("ачаалал");
      if (missing.length > 0) {
        out.push({
          ruleId: "building_footprint_metadata",
          severity: "info",
          message: `"${b.label ?? b.id}" дутуу: ${missing.join(", ")}`,
          entityType: "building",
          entityId: b.id,
          fixHint: "Inspector панелаас давхар + heatLoad_kw оруулах",
        });
      }
    }
    return out;
  },
};

/* ─── Rule 25: consumer_distance_to_source_max ────────────────── */

const consumerDistanceToSourceMax: Rule = {
  id: "consumer_distance_to_source_max",
  category: "geometry",
  severity: "info",
  name: "Хол хэрэглэгч",
  description: "Эх үүсвэрээс 1000 м-ээс хол хэрэглэгч — урт салаа болон илүү дулаан алдагдал.",
  standardRef: "Engineering convention",
  check(project) {
    const sources = project.nodes.filter((n) => isSourceKind(n.kind));
    if (sources.length === 0) return []; // already flagged by source_node_exists
    const consumers = project.nodes.filter((n) => isConsumerKind(n.kind));
    const out: RuleResult[] = [];
    // Phase 11.3 — for 1000-node fixtures the previous per-consumer
    // Dijkstra was O(C·S·V²log V) = catastrophic. Now we run Dijkstra
    // ONCE per source, collect distances to ALL nodes, then per
    // consumer lookup the minimum across sources. Drops the
    // benchmark from ~13s to ~40ms.
    const distancesBySource = new Map<string, Map<string, number>>();
    for (const src of sources) {
      distancesBySource.set(src.id, multiTargetShortestPath_m(src.id, project.pipes));
    }
    for (const consumer of consumers) {
      let minDist = Infinity;
      for (const src of sources) {
        const d = distancesBySource.get(src.id)?.get(consumer.id);
        if (typeof d === "number" && d < minDist) minDist = d;
      }
      if (minDist > CONSUMER_DISTANCE_MAX_M && minDist < Infinity) {
        out.push({
          ruleId: "consumer_distance_to_source_max",
          severity: "info",
          message: `"${consumer.label}" → эх үүсвэр зай = ${minDist.toFixed(0)} м > ${CONSUMER_DISTANCE_MAX_M} м`,
          entityType: "node",
          entityId: consumer.id,
          fixHint: "Ойролцоо дунд UDDT эсвэл шинэ эх үүсвэр төлөвлөх",
        });
      }
    }
    return out;
  },
};

/* ─── Rule 26: pipe_overlap ───────────────────────────────────── */

const pipeOverlap: Rule = {
  id: "pipe_overlap",
  category: "geometry",
  severity: "error",
  name: "Хоолой давхцал",
  description: "Хоёр хоолой яг ижил геометрэй байх ёсгүй — давхцалт зурах алдаа.",
  standardRef: "Engineering convention",
  check(project) {
    const out: RuleResult[] = [];
    const seen = new Map<string, string>();
    for (const pipe of project.pipes) {
      // Canonical key: sorted endpoint ids (treat undirected duplicates).
      const a = pipe.fromNodeId < pipe.toNodeId ? pipe.fromNodeId : pipe.toNodeId;
      const b = pipe.fromNodeId < pipe.toNodeId ? pipe.toNodeId : pipe.fromNodeId;
      const key = `${a}|${b}`;
      const prev = seen.get(key);
      if (prev) {
        out.push({
          ruleId: "pipe_overlap",
          severity: "error",
          message: `Хоолой "${pipe.id}" нь "${prev}" -тэй ижил холболттой`,
          entityType: "pipe",
          entityId: pipe.id,
          fixHint: "Давхцсан хоолойг устгах эсвэл нэгтгэх",
        });
      } else {
        seen.set(key, pipe.id);
      }
    }
    void POINT_OVERLAP_TOL_PX;
    return out;
  },
};

/* ─── Rule 27: dimension_orphan ──────────────────────────────── */

const dimensionOrphan: Rule = {
  id: "dimension_orphan",
  category: "geometry",
  severity: "info",
  name: "Хэмжээ зураасны өнчингөл",
  description: "Устгагдсан зангилаатай холбоотой хэмжээ зураас.",
  standardRef: "Phase 6.6.1 orphan-state cleanup",
  check(project) {
    const out: RuleResult[] = [];
    const nodeIds = new Set(project.nodes.map((n) => n.id));
    for (const d of project.dimensions ?? []) {
      const fromMissing = !nodeIds.has(d.fromNodeId);
      const toMissing = !nodeIds.has(d.toNodeId);
      if (fromMissing || toMissing) {
        out.push({
          ruleId: "dimension_orphan",
          severity: "info",
          message: `Хэмжээ "${d.id}" өнчин зангилаа лавлаж байна`,
          entityType: "project",
          fixHint: "Хэмжээг устгах эсвэл хэмжих зангилаа дахин зурах",
        });
      }
    }
    return out;
  },
};

/* ─── Rule 28: project_metadata_complete ──────────────────────── */

const projectMetadataComplete: Rule = {
  id: "project_metadata_complete",
  category: "project",
  severity: "warn",
  name: "Төслийн мэдээлэл бүрэн",
  description: "Зургийн тамга дахь Engineer / Checker / Company талбарууд бөглөгдсөн байна.",
  standardRef: "ГОСТ 21.501 + Mongolian convention",
  check(project) {
    const tb = project.settings.titleBlock;
    const missing: string[] = [];
    if (!tb?.engineer?.trim()) missing.push("Зурсан");
    if (!tb?.checker?.trim()) missing.push("Шалгасан");
    if (!tb?.company?.trim()) missing.push("Фирм");
    if (missing.length > 0) {
      return [{
        ruleId: "project_metadata_complete",
        severity: "warn",
        message: `Зургийн тамга дутуу: ${missing.join(", ")}`,
        entityType: "project",
        fixHint: "Тохиргоо таб → Зургийн тамга бүх талбарыг бөглөх",
      }];
    }
    return [];
  },
};

/* ─── Rule 29: project_scale_set ──────────────────────────────── */

const projectScaleSet: Rule = {
  id: "project_scale_set",
  category: "project",
  severity: "info",
  name: "Зургийн масштаб",
  description: "Printable scale тодорхой томъёологдсон байх (1:200, 1:500, 1:1000, 1:2000).",
  standardRef: "ГОСТ 21.501 + Mongolian convention",
  check(project) {
    if (!project.settings.printScale) {
      return [{
        ruleId: "project_scale_set",
        severity: "info",
        message: "Зургийн масштаб (printScale) тохируулагдаагүй",
        entityType: "project",
        fixHint: "Тохиргоо таб → 1:500 эсвэл өөр стандарт масштаб сонгох",
      }];
    }
    return [];
  },
};

/* ─── Rule 30: project_paper_set ──────────────────────────────── */

const projectPaperSet: Rule = {
  id: "project_paper_set",
  category: "project",
  severity: "info",
  name: "Цаасны хэмжээ + чиглэл",
  description: "PaperSize + orientation бүртгэгдсэн байх ёстой — Drawing Set-руу зайлшгүй.",
  standardRef: "ГОСТ 21.501",
  check(project) {
    const missing: string[] = [];
    if (!project.settings.printPaperSize) missing.push("paperSize");
    if (!project.settings.printOrientation) missing.push("orientation");
    if (missing.length > 0) {
      return [{
        ruleId: "project_paper_set",
        severity: "info",
        message: `Цаас тохиргоо дутуу: ${missing.join(" + ")}`,
        entityType: "project",
        fixHint: "Тохиргоо таб → A3 / A4 + landscape / portrait сонгох",
      }];
    }
    return [];
  },
};

/* ─── Registry export ─────────────────────────────────────────── */

/**
 * Phase 9.1 + 9.2 + 9.3 — 30 rules. Grouped by category for
 * readability; the engine sorts by severity at runtime.
 */
export const ALL_RULES: ReadonlyArray<Rule> = [
  // Hydraulics — supply/return velocity + Re + balance + length + DN flow
  velocityMaxSupply,
  velocityMaxReturn,
  velocityMinSupply,        // Phase 9.2
  reynoldsMin,              // Phase 9.2
  pressureLossMax,
  pumpHeadReasonable,       // Phase 9.2
  pumpEfficiencyMin,        // Phase 9.2
  circuitBalance,           // Phase 9.2
  pipeDnDecreaseAlongFlow,  // Phase 9.2
  consumerPressureMin,
  // Thermal
  supplyTempMin,
  returnTempMax,            // Phase 9.2
  tempDropMin,              // Phase 9.2
  heatLossPerMeterMax,      // Phase 9.2
  // Geometry
  pipeLengthMaxBranch,      // Phase 9.2
  fixedSupportSpacingMax,   // Phase 9.3
  compensatorSpacingRequired, // Phase 9.3
  wellAtBranches,           // Phase 9.3
  consumerDistanceToSourceMax, // Phase 9.3
  pipeOverlap,              // Phase 9.3
  dimensionOrphan,          // Phase 9.3
  // Materials
  pipeDnMinimum,
  insulationThicknessMin,   // Phase 9.2
  pipeMaterialConsistent,   // Phase 9.2
  // Project
  sourceNodeExists,
  consumerNodeExists,
  buildingFootprintMetadata, // Phase 9.3
  projectMetadataComplete,  // Phase 9.3
  projectScaleSet,          // Phase 9.3
  projectPaperSet,          // Phase 9.3
  // Phase 12.12 — composite channel rules (ГК-23/02 / БНбД 41-02-13 §6)
  ...CHANNEL_RULES,
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
