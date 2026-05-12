/**
 * Pipe heat losses through insulation per МДК 4-05.2004 (simplified).
 *
 *   q_lin = (T_water - T_ambient) / R_total                       [W/m]
 *   R_total = R_insulation + R_air_film
 *   R_insulation = ln(D_out / D_pipe) / (2π · λ_ins)              [m·K/W]
 *
 * For underground (channel-less):
 *   R_total = ln(2·H/D_out) / (2π · λ_soil) + R_insulation        [m·K/W]
 *   T_ambient = soil_temp(season, depth)
 *
 * Insulation materials and λ values from СП 41-103-2000 / МДК Table 5.
 *
 * Aggregated per pipe segment, this contributes a temperature drop:
 *   ΔT = (q_lin · L) / (G · cp)                                    [°C]
 *
 * Mongolian context: most УБ networks use ПУ (полиуретан pre-insulated, ПИ-труба)
 * or mineral wool with reflective film, buried under ~0.7-1.5m soil.
 */

export interface InsulationType {
  key: string;
  name: string;
  /** Thermal conductivity (W/m·K) — at design mean temperature. */
  lambda_w_m_k: number;
  /** Typical thickness range in mm. */
  thickness_mm_typical: [number, number];
}

export const INSULATION_TYPES: InsulationType[] = [
  { key: "pur_pi", name: "ПИ-труба (ППУ изоляция, ГОСТ 30732)", lambda_w_m_k: 0.033, thickness_mm_typical: [40, 80] },
  { key: "mineral_wool", name: "Минераловатная изоляция", lambda_w_m_k: 0.045, thickness_mm_typical: [50, 100] },
  { key: "foam_glass", name: "Пеностекло", lambda_w_m_k: 0.058, thickness_mm_typical: [60, 100] },
  { key: "polystyrene", name: "Пенополистирол (XPS)", lambda_w_m_k: 0.034, thickness_mm_typical: [40, 80] },
  { key: "foamed_polyethylene", name: "Энергофлекс / Пенополиэтилен", lambda_w_m_k: 0.038, thickness_mm_typical: [13, 30] },
  { key: "no_insulation", name: "Дулаалгагүй", lambda_w_m_k: 50, thickness_mm_typical: [0, 0] },
];

export type LayingType = "underground_channelless" | "underground_channel" | "above_ground" | "indoor";

export const LAYING_TYPES: { key: LayingType; label: string }[] = [
  { key: "above_ground", label: "Газар дээр (агаарт)" },
  { key: "underground_channelless", label: "Газар дор (сувгуй)" },
  { key: "underground_channel", label: "Газар дор (суваг дотор)" },
  { key: "indoor", label: "Барилгын дотор (зоор)" },
];

/** Soil thermal conductivity (W/m·K). Default 1.5 for Ulaanbaatar loam. */
export const SOIL_LAMBDA_W_M_K = 1.5;

/** Air film thermal resistance (m²·K/W). */
export const AIR_FILM_R = 0.05;

export interface HeatLossInput {
  /** Pipe outer diameter (mm) — base steel pipe, no insulation. */
  pipeOd_mm: number;
  /** Insulation type key. */
  insulationKey: string;
  /** Insulation thickness (mm). */
  insulationThickness_mm: number;
  /** Water mean temperature (°C). */
  waterTemp_c: number;
  /** Ambient temperature (°C) — air or soil. */
  ambientTemp_c: number;
  /** Laying type. */
  laying: LayingType;
  /** Burial depth from surface to pipe centerline (m). Used for channel-less. */
  burialDepth_m?: number;
}

export interface HeatLossResult {
  /** Linear heat loss (W per meter of pipe). */
  q_lin_w_per_m: number;
  /** Total thermal resistance (m·K/W). */
  R_total: number;
  /** Insulation R (m·K/W). */
  R_insulation: number;
  /** Soil/air R (m·K/W). */
  R_environment: number;
  /** Outer diameter with insulation (mm). */
  outerWithInsulation_mm: number;
}

export function calcLinearHeatLoss(input: HeatLossInput): HeatLossResult {
  const ins = INSULATION_TYPES.find((i) => i.key === input.insulationKey) ?? INSULATION_TYPES[0]!;
  const dp_m = input.pipeOd_mm / 1000;
  const t_m = input.insulationThickness_mm / 1000;
  const dout_m = dp_m + 2 * t_m;

  // R_insulation: cylindrical conduction
  const R_insulation =
    t_m > 0 && ins.lambda_w_m_k > 0 ? Math.log(dout_m / dp_m) / (2 * Math.PI * ins.lambda_w_m_k) : 0;

  // R_environment: depends on laying
  let R_environment: number;
  switch (input.laying) {
    case "underground_channelless": {
      const H = input.burialDepth_m ?? 0.7;
      R_environment = Math.log((2 * H) / dout_m) / (2 * Math.PI * SOIL_LAMBDA_W_M_K);
      break;
    }
    case "underground_channel":
      // Approximation — channel adds an air gap with R ≈ 0.18
      R_environment = 0.18 + Math.log(2 / dout_m) / (2 * Math.PI * SOIL_LAMBDA_W_M_K);
      break;
    case "above_ground":
    case "indoor":
    default:
      // Convective film resistance to air
      R_environment = AIR_FILM_R / (Math.PI * dout_m);
      break;
  }

  const R_total = R_insulation + R_environment;
  const q_lin = (input.waterTemp_c - input.ambientTemp_c) / Math.max(R_total, 1e-6);

  return {
    q_lin_w_per_m: q_lin,
    R_total,
    R_insulation,
    R_environment,
    outerWithInsulation_mm: dout_m * 1000,
  };
}

/**
 * Aggregate heat losses across a pipe (segment).
 * Returns total loss in watts and equivalent temperature drop assuming counter-flow.
 */
export function aggregatePipeLoss(
  pipeLength_m: number,
  q_lin_w_per_m: number,
  G_kg_s: number,
  cp_j_kg_k = 4187,
): { totalLoss_w: number; deltaT_c: number } {
  const totalLoss = q_lin_w_per_m * pipeLength_m;
  const deltaT = G_kg_s > 0 ? totalLoss / (G_kg_s * cp_j_kg_k) : 0;
  return { totalLoss_w: totalLoss, deltaT_c: deltaT };
}
