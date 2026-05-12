/**
 * Norm compliance check per БНбД 41-01-2019 / СП 124.13330.2012.
 * Flags pipes/nodes that violate velocity, pressure, or material limits.
 */
import { NORM_THRESHOLDS, PIPE_MATERIALS, TEMP_SCHEDULES } from "shared";
import type {
  CalculationResults,
  NormViolation,
  ProjectSettings,
  SchemeNode,
  SchemePipe,
} from "../hydraulicTypes";

export function checkNorms(
  nodes: SchemeNode[],
  pipes: SchemePipe[],
  results: CalculationResults,
  settings: ProjectSettings,
): NormViolation[] {
  const violations: NormViolation[] = [];
  const schedule = TEMP_SCHEDULES.find((t) => t.key === settings.temperatureScheduleKey) ?? TEMP_SCHEDULES[0]!;
  const supplyT = schedule.supply_c;

  // --- per pipe ---
  for (const pipe of pipes) {
    const r = results.pipes.find((x) => x.pipeId === pipe.id);
    if (!r) continue;
    const target = { kind: "pipe" as const, id: pipe.id };

    if (r.v_m_s > NORM_THRESHOLDS.velocity_max_main_ms) {
      violations.push({
        kind: "velocity_high",
        severity: "error",
        message: `v = ${r.v_m_s.toFixed(2)} м/с > ${NORM_THRESHOLDS.velocity_max_main_ms} м/с (СП 124.13330.2012). Диаметрийг ахиулна уу.`,
        target,
        threshold: NORM_THRESHOLDS.velocity_max_main_ms,
        actual: r.v_m_s,
        unit: "m/s",
      });
    } else if (r.v_m_s < NORM_THRESHOLDS.velocity_min_ms && r.G_kg_s > 0.01) {
      violations.push({
        kind: "velocity_low",
        severity: "warning",
        message: `v = ${r.v_m_s.toFixed(3)} м/с < ${NORM_THRESHOLDS.velocity_min_ms} м/с — агаар, хагралах эрсдэлтэй.`,
        target,
        threshold: NORM_THRESHOLDS.velocity_min_ms,
        actual: r.v_m_s,
        unit: "m/s",
      });
    }

    if (r.headlossPerMeter_pa > NORM_THRESHOLDS.headloss_max_main_pa_per_m) {
      violations.push({
        kind: "headloss_high",
        severity: "warning",
        message: `R = ${r.headlossPerMeter_pa.toFixed(0)} Pa/m > ${NORM_THRESHOLDS.headloss_max_main_pa_per_m} Pa/m (эдийн засгийн оновчтой хязгаар).`,
        target,
        threshold: NORM_THRESHOLDS.headloss_max_main_pa_per_m,
        actual: r.headlossPerMeter_pa,
        unit: "Pa/m",
      });
    }

    // material vs temperature
    const mat = PIPE_MATERIALS.find((m) => m.key === pipe.materialKey);
    if (mat && supplyT > mat.max_temp_c) {
      violations.push({
        kind: "material_temp",
        severity: "error",
        message: `"${mat.name}" нь ${mat.max_temp_c}°C хүртэл ажиллана. Одоогийн схем ${supplyT}°C-т ажилладаг.`,
        target,
        threshold: mat.max_temp_c,
        actual: supplyT,
        unit: "°C",
      });
    }
  }

  // --- per consumer ---
  // RULE-T01 (Phase 5D.4): supply temperature at consumer inlet must
  // stay at or above the engineering minimum (default 80 °C per БНбД
  // 41-01-2019 §5.4 — ensures the ИТП exchanger can deliver design
  // ΔT at the radiators). The check is opt-in: it only fires when the
  // solver ran with heat-loss integration enabled (supplyTemp_C_at_inlet
  // is populated). Legacy projects without heat-loss data skip the
  // check entirely.
  const minSupplyT = settings.minSupplyTemp_c ?? 80;
  for (const node of nodes.filter((n) => n.kind === "consumer")) {
    const nr = results.nodes.find((x) => x.nodeId === node.id);
    if (!nr) continue;
    const minRequired = node.requiredPressure_mpa ?? NORM_THRESHOLDS.dp_consumer_min_mpa;
    if (nr.pressureAtNode_mpa < minRequired) {
      violations.push({
        kind: "pressure_low",
        severity: "error",
        message: `"${node.label}" дээрх даралт ${nr.pressureAtNode_mpa.toFixed(3)} MPa < ${minRequired} MPa шаардлагатай.`,
        target: { kind: "node", id: node.id },
        threshold: minRequired,
        actual: nr.pressureAtNode_mpa,
        unit: "MPa",
      });
    }
    // RULE-T01 — supply temperature minimum at consumer.
    if (typeof nr.supplyTemp_C_at_inlet === "number" && nr.supplyTemp_C_at_inlet < minSupplyT) {
      violations.push({
        kind: "supply_temp_low",
        severity: "error",
        message: `"${node.label}" дээрх нийлүүлэх ус ${nr.supplyTemp_C_at_inlet.toFixed(1)}°C < ${minSupplyT}°C доод хязгаар (БНбД 41-01-2019 §5.4). Магистрал хоолойн дулаалга нэмэх / диаметр өсгөх.`,
        target: { kind: "node", id: node.id },
        threshold: minSupplyT,
        actual: nr.supplyTemp_C_at_inlet,
        unit: "°C",
      });
    }
  }

  return violations;
}

export function summarizeViolations(violations: NormViolation[]) {
  const errors = violations.filter((v) => v.severity === "error").length;
  const warnings = violations.filter((v) => v.severity === "warning").length;
  return { errors, warnings, compliant: errors === 0 };
}
