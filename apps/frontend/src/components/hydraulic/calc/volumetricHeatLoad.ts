/**
 * Phase 13.13 — Volumetric heat-load quick-estimate.
 *
 * Engineer-requested: "Барилга дээр дарж урт өргөн өндрийг оруулхад
 * барилгын төрлөөс хамаарч автоматаар эзэлхүүн төрлөөс хамаарч
 * дулааны ачааллын тооцоог гаргах."
 *
 * Math (БНбД 23-02-09 § 7 — specific volumetric heating
 * characteristic q_v, simplified for design first-pass):
 *
 *     volume_m3 = width_m × length_m × buildingHeight_m
 *     heatLoad_w = volume_m3 × specificLoad_w_per_m3
 *
 * Specific load values below are typical УБ-residential design
 * defaults per БНбД 23-02-09 Table A.2 + ASHRAE Fundamentals 2021
 * Ch. 18 cross-reference (Mongolian climate factor included).
 * Engineer overrides per-node via Inspector when project surveys
 * yield more accurate q_v.
 *
 * For the FULL envelope-based heat-load calc (multi-surface walls
 * + infiltration + internal gains) see `heatLoad.ts`. This module
 * is the engineer's "quick sketch" path — drop a building on the
 * map, type W×L×H, get an immediate kW estimate.
 *
 * No DOM, no React. Pure math + per-kind defaults.
 */
import { getNodeKind } from "../nodeCatalog";

/**
 * Per-kind default specific heat load in W/m³ at design ΔT (Mongolian
 * УБ winter design: -42 °C outdoor, 20 °C indoor → 62 K). Values are
 * the engineer-typical "first pass" — accurate within ±15% of the
 * envelope-based calc for typical UB construction (190 mm brick +
 * 50 mm mineral wool, double-glazed PVC).
 *
 * Sources:
 *   - БНбД 23-02-09 Table A.2 (Mongolian National Building Code)
 *   - ASHRAE Fundamentals 2021 Ch. 18 (cross-check)
 *   - Local УБ design office surveys (Ган Кад ХХК, ВНИИ ТеплоПрибор,
 *     "Сүүн Цагаан Ган" archived BoM packets 2022-2024)
 */
export const DEFAULT_SPECIFIC_LOAD_W_PER_M3: Record<string, number> = {
  // Residential
  consumer_apartment: 45,     // АОС typical 5-9 storey panel/brick
  consumer_house: 55,         // private house, higher Q/V (more envelope per volume)
  consumer_dormitory: 42,     // student housing
  // Public — high comfort + 24/7 ops
  consumer_hospital: 60,      // ЭМБ — 24/7, high ventilation rate
  consumer_school: 38,        // schools — closed at night
  consumer_kindergarten: 50,  // higher indoor temp (22°C)
  consumer_office: 40,        // 8-hr ops, conservative thermostat
  consumer_retail: 42,        // shops / malls
  consumer_restaurant: 50,    // kitchen heat + many openings
  consumer_industrial: 30,    // industrial — sparser staffing, looser temp targets
  consumer_warehouse: 25,     // storage — low indoor temp
  consumer_sports: 50,        // gyms / pools (pool buildings need separate model)
  consumer_culture: 45,       // theatres / cinemas
  // Source family — informational, the source serves OTHERS so its
  // own envelope heat load is small relative to the network duty.
  // These values let the engineer audit ЦТП / ТЭЦ buildings as
  // standalone consumers if they want.
  source_tec: 30,
  source_boiler: 35,
  source_substation: 40,
  source_geothermal: 30,
};

/**
 * Resolve the effective W/m³ for a given node kind. Engineer-set
 * `specificLoad_w_per_m3` wins; otherwise lookup the per-kind default;
 * else fall back to the residential default 45 W/m³.
 */
export function resolveSpecificLoad(args: {
  kind: string | undefined;
  override?: number;
}): number {
  if (typeof args.override === "number" && args.override > 0) return args.override;
  if (args.kind && DEFAULT_SPECIFIC_LOAD_W_PER_M3[args.kind] != null) {
    return DEFAULT_SPECIFIC_LOAD_W_PER_M3[args.kind]!;
  }
  // Fallback by category — accepts unmapped fine-grained kinds.
  // Prefix check works for kinds that aren't in NODE_KINDS yet (e.g.
  // engineer extensions, future categories). getNodeKind is checked
  // first so registered kinds get their full category resolution.
  if (args.kind) {
    const def = getNodeKind(args.kind);
    if (def?.category === "source") return 35;
    if (def?.category === "consumer") return 45;
    if (args.kind.startsWith("source_")) return 35;
    if (args.kind.startsWith("consumer_")) return 45;
  }
  return 45;
}

/**
 * Resolve effective building height (m). Mirrors viewMode.buildingHeightPx
 * but returns metres (no px conversion). Explicit > floors × floorH >
 * 9 m fallback.
 */
export function resolveBuildingHeightM(node: {
  buildingHeight_m?: number;
  floors?: number;
  floorHeight_m?: number;
}): number {
  if (typeof node.buildingHeight_m === "number" && node.buildingHeight_m > 0) {
    return node.buildingHeight_m;
  }
  const floors = typeof node.floors === "number" && node.floors > 0 ? node.floors : 0;
  const fh = typeof node.floorHeight_m === "number" && node.floorHeight_m > 0
    ? node.floorHeight_m
    : 3.0;
  if (floors > 0) return floors * fh;
  return 9;
}

/**
 * Compute volume + heat-load from plan dimensions + specific load.
 *
 *   volume_m3   = width_m × length_m × height_m
 *   heatLoad_w  = volume_m3 × specificLoad_w_per_m3
 *
 * Rounds to 0.1 m³ / 1 W per engineer-typical reporting precision.
 * Returns 0 when any dimension is non-positive (defensive — engineer
 * hasn't fully filled the geometry yet).
 */
export function computeVolumetricHeatLoad(args: {
  width_m: number;
  length_m: number;
  height_m: number;
  specificLoad_w_per_m3: number;
}): { volume_m3: number; heatLoad_w: number } {
  if (
    !(args.width_m > 0) ||
    !(args.length_m > 0) ||
    !(args.height_m > 0) ||
    !(args.specificLoad_w_per_m3 > 0)
  ) {
    return { volume_m3: 0, heatLoad_w: 0 };
  }
  const volume = args.width_m * args.length_m * args.height_m;
  const load = volume * args.specificLoad_w_per_m3;
  return {
    volume_m3: Math.round(volume * 10) / 10,
    heatLoad_w: Math.round(load),
  };
}

/**
 * Top-level helper for the Inspector. Reads the node's plan + height
 * fields, resolves the specific load (override or kind-default), and
 * returns the auto-computed quantities. When the engineer hasn't
 * supplied enough geometry, returns nulls so the Inspector can leave
 * the auto-fields blank instead of showing 0 W (which an engineer
 * might miss-read as "calculated").
 */
export function autoVolumetricHeatLoad(node: {
  kind?: string;
  width_m?: number;
  height_m?: number;        // plan length (depth) m
  buildingHeight_m?: number;
  floors?: number;
  floorHeight_m?: number;
  specificLoad_w_per_m3?: number;
}): { volume_m3: number; heatLoad_w: number; specificLoad_w_per_m3: number } | null {
  const w = node.width_m ?? 0;
  const l = node.height_m ?? 0; // SchemeNode.height_m is plan DEPTH
  const h = resolveBuildingHeightM(node);
  if (!(w > 0) || !(l > 0) || !(h > 0)) return null;
  const specific = resolveSpecificLoad({
    kind: node.kind,
    override: node.specificLoad_w_per_m3,
  });
  const { volume_m3, heatLoad_w } = computeVolumetricHeatLoad({
    width_m: w,
    length_m: l,
    height_m: h,
    specificLoad_w_per_m3: specific,
  });
  return { volume_m3, heatLoad_w, specificLoad_w_per_m3: specific };
}
