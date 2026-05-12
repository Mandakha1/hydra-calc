/**
 * Heat substation (ИТП / ЦТП) device sizing — per Zulu Thermo / СП 124.13330.2012
 * conventions used in Russian/Mongolian heat networks.
 *
 * Implements:
 *   - Throttle washer (дроссельная шайба) diameter from ΔP, G  — Formula 31
 *   - Elevator throat (диаметр горловины элеватора) from G_blend  — Formula 27
 *   - Elevator nozzle (сопло) from u (mixing coefficient)        — Formula 28
 *   - Plate heat exchanger preliminary sizing
 */

const RHO_HOT = 935; // kg/m³ at 130 °C
const C_P = 4187;

export interface ThrottleWasherInput {
  /** Pressure drop to dissipate (Pa). */
  deltaP_pa: number;
  /** Mass flow rate (kg/s). */
  G_kg_s: number;
  /** Discharge coefficient (typically μ ≈ 0.60-0.65 for thin orifice). */
  dischargeCoefficient?: number;
  /** Water density (kg/m³) — defaults to 935 (130 °C primary side). */
  rho_kg_m3?: number;
}

export interface ThrottleWasherResult {
  /** Required orifice diameter in mm (rounded up to 0.5 mm increments). */
  D_orifice_mm: number;
  /** Raw computed diameter before rounding (mm). */
  D_raw_mm: number;
  /** Number of washers in series if D_required < 3 mm (min spec). */
  inSeries: number;
  /** Warning if value is out of feasible range. */
  warning?: string;
}

/**
 * Formula 31 (СП 124.13330): D = sqrt( G · 4 / (π · μ · sqrt(2·ρ·ΔP)) ) · 1000
 * Result in mm. Min washer D = 3 mm — if smaller, stack in series.
 */
export function sizeThrottleWasher(input: ThrottleWasherInput): ThrottleWasherResult {
  const mu = input.dischargeCoefficient ?? 0.62;
  const rho = input.rho_kg_m3 ?? RHO_HOT;
  const dP = Math.max(input.deltaP_pa, 100); // floor at 100 Pa to avoid sqrt(0)
  const A = input.G_kg_s / (mu * Math.sqrt(2 * rho * dP));
  const D_m = Math.sqrt((4 * A) / Math.PI);
  const D_mm_raw = D_m * 1000;

  // Round up to 0.5 mm
  const D_rounded = Math.ceil(D_mm_raw * 2) / 2;

  let inSeries = 1;
  let dressed = D_rounded;
  let warning: string | undefined;

  if (D_rounded < 3) {
    // Multiple in series — each shaib dissipates ΔP/n, so D_each = D_raw * n^(1/4)
    inSeries = Math.ceil(Math.pow(3 / D_rounded, 4));
    dressed = Math.ceil(D_mm_raw * Math.pow(inSeries, 0.25) * 2) / 2;
    if (dressed < 3) dressed = 3;
    warning = `Шаардлагатай D < 3мм — ${inSeries}-аар цуваа холбох`;
  } else if (D_rounded > 25) {
    warning = "D > 25мм — шайбагийн оронд даралт зохицуулагч (регулятор) хэрэглэх нь зүйтэй";
  }

  return {
    D_orifice_mm: dressed,
    D_raw_mm: D_mm_raw,
    inSeries,
    warning,
  };
}

export interface ElevatorInput {
  /** Total heat load (W). */
  Q_w: number;
  /** Primary supply temperature (°C). */
  t1_supply_c: number;
  /** Secondary supply temperature (°C — after mixing). */
  t3_blend_c: number;
  /** Return temperature (°C). */
  t2_return_c: number;
  /** Available pressure differential (Pa). */
  availableDp_pa: number;
}

export interface ElevatorResult {
  /** Mixing coefficient (u = G_recirc / G_primary). */
  u: number;
  /** Required network mass flow (kg/s). */
  G_primary_kg_s: number;
  /** Total mass flow through secondary (kg/s). */
  G_secondary_kg_s: number;
  /** Throat diameter D_г (mm) — rounded down to 0.5 mm. */
  D_throat_mm: number;
  /** Nozzle diameter d_сопло (mm) — rounded down to 0.1 mm, min 3 mm. */
  D_nozzle_mm: number;
  warning?: string;
}

/**
 * Formula 27 + 28 (СП 124.13330):
 *   u = (t1 - t3) / (t3 - t2)
 *   G_p = Q / (cp · (t1 - t2))
 *   G_s = G_p · (1 + u)
 *   D_г (mm) = 8.5 · (G_s²·(1+u)² / ΔP)^0.25
 *   d_с (mm) = D_г / sqrt(1 + 0.78 · u + 0.6 · u²)
 */
export function sizeElevator(input: ElevatorInput): ElevatorResult {
  const u = (input.t1_supply_c - input.t3_blend_c) / Math.max(input.t3_blend_c - input.t2_return_c, 0.1);
  const Gp = input.Q_w / (C_P * Math.max(input.t1_supply_c - input.t2_return_c, 1));
  const Gs = Gp * (1 + u);
  const dP_kpa = input.availableDp_pa / 1000;

  // Empirical Зингер formula (mm, kPa, t/h)
  const Gs_t_per_h = Gs * 3.6;
  const D_throat_raw =
    8.5 * Math.pow((Gs_t_per_h * Gs_t_per_h * (1 + u) * (1 + u)) / Math.max(dP_kpa, 0.5), 0.25);
  const D_throat = Math.floor(D_throat_raw * 2) / 2;

  const D_nozzle_raw = D_throat / Math.sqrt(1 + 0.78 * u + 0.6 * u * u);
  const D_nozzle = Math.max(3, Math.floor(D_nozzle_raw * 10) / 10);

  let warning: string | undefined;
  if (u < 1.5) warning = "u < 1.5 — холих коэффициент бага, элеватор оронд насос үзнэ үү";
  if (u > 5) warning = "u > 5 — элеватор биш, ялтсан дулаан солилцуур (ХТС) илүү тохиромжтой";
  if (D_throat_raw > 60) warning = "D_горловины > 60мм — стандарт элеваторын хязгаараас хэтэрсэн";

  return {
    u,
    G_primary_kg_s: Gp,
    G_secondary_kg_s: Gs,
    D_throat_mm: D_throat,
    D_nozzle_mm: D_nozzle,
    warning,
  };
}

export interface PlateHeatExchangerInput {
  Q_w: number;
  t1_in_c: number;
  t1_out_c: number;
  t2_in_c: number;
  t2_out_c: number;
  /** Overall heat transfer coefficient (W/m²·K). Default 4500 for water-water. */
  U_w_m2_k?: number;
}

export interface PlateHeatExchangerResult {
  /** Required heat transfer area (m²). */
  area_m2: number;
  /** Log Mean Temperature Difference (°C). */
  LMTD_c: number;
  /** Primary side mass flow (kg/s). */
  G_primary_kg_s: number;
  /** Secondary side mass flow (kg/s). */
  G_secondary_kg_s: number;
  /** Suggested model class (small / medium / large). */
  modelClass: string;
}

/**
 * Plate heat exchanger sizing (counter-flow):
 *   LMTD = (ΔT₁ - ΔT₂) / ln(ΔT₁/ΔT₂)
 *   A = Q / (U · LMTD)
 */
export function sizePlateHeatExchanger(input: PlateHeatExchangerInput): PlateHeatExchangerResult {
  const U = input.U_w_m2_k ?? 4500;
  const dT1 = input.t1_in_c - input.t2_out_c;
  const dT2 = input.t1_out_c - input.t2_in_c;
  const LMTD =
    Math.abs(dT1 - dT2) < 0.1
      ? (dT1 + dT2) / 2
      : (dT1 - dT2) / Math.log(Math.abs(dT1 / dT2) || 1.0001);
  const area = input.Q_w / (U * Math.max(LMTD, 1));

  const Gp = input.Q_w / (C_P * Math.max(input.t1_in_c - input.t1_out_c, 1));
  const Gs = input.Q_w / (C_P * Math.max(input.t2_out_c - input.t2_in_c, 1));

  const modelClass =
    area < 5 ? "Жижиг (Alfa Laval CB30 / Ridan НН14)" :
    area < 30 ? "Дунд (Alfa Laval M3 / Ridan НН42)" :
    "Том (Alfa Laval M6 / Ridan НН100+)";

  return {
    area_m2: area,
    LMTD_c: LMTD,
    G_primary_kg_s: Gp,
    G_secondary_kg_s: Gs,
    modelClass,
  };
}
