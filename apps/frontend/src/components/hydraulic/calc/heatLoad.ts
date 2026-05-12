/**
 * Heat load calculation per БНбД 23-02-09.
 *
 *   Q_transmission = Σ (A_i · ΔT / R_i) · (1 + Σβ)                 [W]
 *   Q_infiltration = 0.28 · c_air · ρ_air · V · n · ΔT              [W]
 *   Q_internal     = gains_w_per_m2 · A_floor                       [W]
 *   Q_total        = Q_transmission + Q_infiltration − Q_internal   [W]
 *
 * ΔT = T_indoor − T_outdoor (design).
 */
import {
  CLIMATE,
  WALL_TYPES,
  CORRECTION_FACTORS,
  ACH_BY_USE,
  INDOOR_TEMP_BY_USE,
  AIR_PROPS,
  INTERNAL_GAINS_W_PER_M2,
} from "shared";
import type { BuildingEnvelope } from "../hydraulicTypes";

export interface HeatLoadBreakdown {
  total_w: number;
  transmission_w: number;
  infiltration_w: number;
  internal_gains_w: number;
  deltaT_c: number;
  perSurface: Array<{ id: string; wallTypeName: string; area_m2: number; uValue: number; q_w: number }>;
}

export function calcHeatLoad(env: BuildingEnvelope, overrideOutdoorC?: number): HeatLoadBreakdown {
  const climate = CLIMATE.find((c) => c.city === env.city) ?? CLIMATE[0]!;
  const t_out = overrideOutdoorC ?? climate.tnr_c;
  const t_in = INDOOR_TEMP_BY_USE[env.use] ?? INDOOR_TEMP_BY_USE.residential;
  const dT = t_in - t_out;

  const perSurface: HeatLoadBreakdown["perSurface"] = [];
  let transmission = 0;
  for (const s of env.surfaces) {
    const wall = WALL_TYPES.find((w) => w.key === s.wallTypeKey);
    if (!wall || wall.r_value <= 0) continue;
    let beta = 0;
    if (s.orientation) {
      const o = CORRECTION_FACTORS.orientation[s.orientation];
      beta += o;
    }
    if (s.isCorner) beta += CORRECTION_FACTORS.two_outside_walls_corner;
    const q = (s.area_m2 * dT) / wall.r_value * (1 + beta);
    transmission += q;
    perSurface.push({
      id: s.id,
      wallTypeName: wall.name,
      area_m2: s.area_m2,
      uValue: wall.u_value,
      q_w: q,
    });
  }

  const volume = env.volume_m3 ?? env.floor_area_m2 * 2.8;
  const n = ACH_BY_USE[env.use] ?? ACH_BY_USE.residential;
  const infiltration =
    0.28 * AIR_PROPS.specific_heat_kJ_kgK * AIR_PROPS.density_kg_m3 * volume * n * dT;

  const internal_gains = INTERNAL_GAINS_W_PER_M2[env.use as keyof typeof INTERNAL_GAINS_W_PER_M2] ?? 10;
  const internal = internal_gains * env.floor_area_m2;

  const total = transmission + infiltration - internal;

  return {
    total_w: Math.max(0, total),
    transmission_w: transmission,
    infiltration_w: infiltration,
    internal_gains_w: internal,
    deltaT_c: dT,
    perSurface,
  };
}

/** Quick degree-day estimate for seasonal energy demand. */
export function heatingDegreeDays(env: BuildingEnvelope): number {
  const climate = CLIMATE.find((c) => c.city === env.city) ?? CLIMATE[0]!;
  const t_in = INDOOR_TEMP_BY_USE[env.use] ?? 20;
  return climate.heating_days * Math.max(0, t_in - climate.t_avg_heating_c);
}
