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

/* ─── Registry export ─────────────────────────────────────────── */

/**
 * Phase 9.1 + 9.2 — 20 rules. Phase 9.3 appends 10 more.
 * Order doesn't affect behaviour (the engine sorts by severity), but
 * it's grouped by category for readability.
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
  // Materials
  pipeDnMinimum,
  insulationThicknessMin,   // Phase 9.2
  pipeMaterialConsistent,   // Phase 9.2
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
