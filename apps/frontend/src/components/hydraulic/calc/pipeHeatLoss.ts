/**
 * Phase 5C — pipe insulation heat loss (engineering-grade).
 *
 * Standard: БНбД 41-04-13 / СП 41-103-2000 / VDI Heat Atlas (Section M).
 *
 * Computes the heat loss per unit length for a fluid-filled cylindrical
 * pipe with optional insulation + protective jacket, installed in:
 *   - "air"     : above-ground, e.g. plant rooms or aerial pipe rack
 *   - "channel" : subterranean reinforced-concrete trench (warm dead-air)
 *   - "buried"  : direct burial in soil at a specified depth
 *
 * Why this matters for Mongolian district heating:
 *   At -39 °C peak design ambient, a 380 m DN50 trunk with 50 mm PUR
 *   foam loses ~20 W/m — ~7.6 kW total, ~10 % of the network's
 *   delivered heat. Supply temperature drops 2-3 °C along the way,
 *   which reduces the ΔT available at far consumers and increases the
 *   required mass flow. This composes with the Phase 5A round-trip
 *   pump sizing fix in Phase 5D.
 *
 * Physics — steady-state radial conduction through composite cylinders:
 *
 *   q' = (T_fluid − T_ambient) / R_total                          [W/m]
 *
 *   R_total = R_conv_inner + R_pipe + R_ins + R_jacket + R_outer  [m·K/W]
 *
 *   R_conv_inner = 1 / (h_inner · π · d_inner)
 *   R_pipe       = ln(d_outer_pipe / d_inner)     / (2π · k_steel)
 *   R_ins        = ln(d_outer_ins  / d_outer_pipe) / (2π · k_ins)
 *   R_jacket     = ln(d_outer_jkt  / d_outer_ins ) / (2π · k_jkt)
 *   R_outer      = depends on installation:
 *     "air"/"channel": 1 / (h_outer · π · d_outer_jkt)
 *     "buried":        ln(2H / d_outer_jkt) / (2π · k_soil)
 *                      (Carslaw-Jaeger isothermal-surface shape factor;
 *                       H = burial depth to pipe centreline, valid for
 *                       H/d_outer_jkt ≥ 1)
 *
 *   Surface temperature (outer jacket, or bare pipe if no insulation):
 *     T_surface = T_ambient + q' · R_outer                        [°C]
 *
 *   Temperature drop along a path at constant mass flow ṁ:
 *     ΔT = Σ(q'_i · L_i) / (ṁ · c_p)                              [K]
 *
 * Default coefficients (БНбД 41-04-13 + VDI Heat Atlas, mid-range values):
 *   K_STEEL_W_MK              = 50    (all carbon-steel grades, low-alloy)
 *   K_PUR_FOAM_FRESH_W_MK     = 0.025 (closed-cell PUR, manufacturer
 *                                      spec, factory-fresh; passes the
 *                                      published-table sanity checks)
 *   K_PUR_FOAM_AGED_W_MK      = 0.033 (БНбД 41-04-13 design value for
 *                                      year-1+ aged foam in service)
 *   K_PE_JACKET_W_MK          = 0.4   (HDPE)
 *   K_SOIL_TYPICAL_W_MK       = 1.5   (УБ loam, mean season)
 *   H_WATER_FORCED_W_M2K      = 2000  (forced convection in well-
 *                                      circulated DH supply/return)
 *   H_AIR_STILL_W_M2K         = 10    (still air in trench/channel)
 *   JACKET_THICKNESS_DEFAULT_MM = 3   (standard HDPE jacket per ГОСТ 30732)
 *
 * NOT in scope (Phase 5D will integrate):
 *   - Mutating SchemePipe.length_m or per-pipe q'.
 *   - Propagating supply T drop into per-consumer ΔT and mass-flow
 *     re-balancing.
 *   - Surcharge to sizePump() H_m for the reduced ΔT at far consumers.
 *
 *   This module is a PURE function library — no I/O, no DOM, no state.
 */

/** Steel thermal conductivity (W/m·K). Carbon + low-alloy steels all
 *  cluster around 45-55. The 50 round number is engineering-standard
 *  and well inside any reasonable measurement band. */
export const K_STEEL_W_MK = 50;

/** Fresh closed-cell PUR foam (manufacturer spec). The default our
 *  test suite calibrates against; aged installations should pass the
 *  АГED value via `insulationConductivity_W_mK`. */
export const K_PUR_FOAM_FRESH_W_MK = 0.025;

/** Aged PUR foam — the design value БНбД 41-04-13 mandates for the
 *  "shall last 30 years" sizing rule. ~32 % higher loss than fresh. */
export const K_PUR_FOAM_AGED_W_MK = 0.033;

/** HDPE protective jacket. Same value for PE-HD and PE-LD within the
 *  precision of this calculation. */
export const K_PE_JACKET_W_MK = 0.4;

/** Soil thermal conductivity for Mongolian loam in the mean season.
 *  Frozen season would use ~2.5 — caller can pass via the soil
 *  conductivity override. */
export const K_SOIL_TYPICAL_W_MK = 1.5;

/** Inner-surface heat transfer coefficient for forced-convection water
 *  flow at district-heating velocities (0.3-2 m/s). The R_conv_inner
 *  term is small compared to insulation, so a single representative
 *  value covers the design range without needing Dittus-Boelter. */
export const H_WATER_FORCED_W_M2K = 2000;

/** Outer film coefficient for still air (typical channel / aerial-pipe
 *  installation). Wind-exposed pipes would use 25-30. */
export const H_AIR_STILL_W_M2K = 10;

/** Default jacket thickness for ПИ-труба (ГОСТ 30732). */
export const JACKET_THICKNESS_DEFAULT_MM = 3;

/** c_p of water at 82.5 °C mean DH temperature. */
export const CP_WATER_J_KGK = 4187;

/** Where the pipe is laid — drives the outer-film resistance formula. */
export type Installation = "buried" | "air" | "channel";

export interface HeatLossInputs {
  /** Fluid (supply or return) temperature, °C. */
  fluidTemp_C: number;
  /** Ambient temperature at the pipe location, °C.
   *  - "air"    : outdoor air (e.g. −39 for УБ peak design)
   *  - "channel": dead-air in the trench (typically +10 …+15)
   *  - "buried" : soil temperature at burial depth (УБ winter ≈ +1 …+5) */
  ambientTemp_C: number;
  /** Steel pipe outer diameter, mm (e.g. 57 for standard GOST DN50,
   *  60 for V-group DN50). */
  pipeOuterDiameter_mm: number;
  /** Steel pipe wall thickness, mm (e.g. 3.5 for standard GOST DN50,
   *  2.5 for V-group). */
  pipeWallThickness_mm: number;
  /** Radial insulation thickness, mm. Pass 0 for a bare pipe; the
   *  jacket layer is automatically skipped too. */
  insulationThickness_mm: number;
  /** Insulation conductivity (W/m·K). Defaults to fresh closed-cell
   *  PUR (0.025). Pass K_PUR_FOAM_AGED_W_MK or a measured value for
   *  service-aged or alternative insulation. */
  insulationConductivity_W_mK?: number;
  /** Radial jacket thickness, mm. Default 3 mm HDPE. Ignored when
   *  insulationThickness_mm is 0. */
  jacketThickness_mm?: number;
  /** Jacket conductivity (W/m·K). Default 0.4 (HDPE). */
  jacketConductivity_W_mK?: number;
  /** Installation type — drives R_outer formula. */
  installation: Installation;
  /** Burial depth from surface to pipe centreline (m). Required when
   *  installation = "buried"; otherwise ignored. Default 1.0 m. */
  burialDepth_m?: number;
  /** Soil conductivity for buried installation. Default 1.5 W/m·K. */
  soilConductivity_W_mK?: number;
  /** Inner film coefficient override (W/m²·K). Default 2000 (forced
   *  water). Lower for stagnant or low-velocity loops. */
  innerHtc_W_m2K?: number;
  /** Outer film coefficient override (W/m²·K). Default 10 (still air).
   *  Use 25-30 for wind-exposed pipes. Ignored for "buried" (soil
   *  shape factor replaces the convective film). */
  outerHtc_W_m2K?: number;
  /** Pipe wall conductivity override (W/m·K). Default 50 (carbon
   *  steel). Stainless ~16, copper ~390. */
  pipeConductivity_W_mK?: number;
}

export interface ThermalResistanceBreakdown {
  /** R_conv_inner — forced-convection film from water to pipe wall. */
  convInner: number;
  /** R_pipe — conduction through the steel pipe wall. */
  pipeWall: number;
  /** R_ins — conduction through the insulation layer (0 if bare). */
  insulation: number;
  /** R_jacket — conduction through the protective jacket (0 if bare). */
  jacket: number;
  /** R_outer — outer film (air/channel) OR soil shape factor (buried). */
  outer: number;
  /** Sum of all five resistances. q' = ΔT / R_total. */
  total: number;
}

export interface HeatLossResult {
  /** Heat loss per metre of pipe (W/m). Positive when fluid is warmer
   *  than ambient (losing heat); negative if reversed. */
  heatLossPerMeter_W: number;
  /** Per-layer thermal resistance in m·K/W. Useful to surface in UI
   *  ("which layer dominates the heat path?") and for diagnostic
   *  cross-checks vs published tables. */
  thermalResistance_mK_W: ThermalResistanceBreakdown;
  /** Outer surface temperature (°C). For bare pipes ≈ fluid temp →
   *  burn hazard; for well-insulated pipes ≈ ambient → safe to touch. */
  surfaceTemperature_C: number;
}

/**
 * Compute heat loss per metre for an insulated cylindrical pipe.
 *
 * Pure function — same input always gives same output, no I/O.
 *
 * @throws Error when pipe wall is thicker than half the OD (would
 *   produce a non-positive inner diameter).
 * @throws Error when installation = "buried" and burial depth is less
 *   than half the jacket OD (shape-factor formula breaks down).
 */
export function computePipeHeatLoss(inputs: HeatLossInputs): HeatLossResult {
  const {
    fluidTemp_C,
    ambientTemp_C,
    pipeOuterDiameter_mm,
    pipeWallThickness_mm,
    insulationThickness_mm,
    insulationConductivity_W_mK = K_PUR_FOAM_FRESH_W_MK,
    jacketThickness_mm = JACKET_THICKNESS_DEFAULT_MM,
    jacketConductivity_W_mK = K_PE_JACKET_W_MK,
    installation,
    burialDepth_m = 1.0,
    soilConductivity_W_mK = K_SOIL_TYPICAL_W_MK,
    innerHtc_W_m2K = H_WATER_FORCED_W_M2K,
    outerHtc_W_m2K = H_AIR_STILL_W_M2K,
    pipeConductivity_W_mK = K_STEEL_W_MK,
  } = inputs;

  // Convert to SI metres.
  const d_outer_pipe = pipeOuterDiameter_mm / 1000;
  const d_inner = (pipeOuterDiameter_mm - 2 * pipeWallThickness_mm) / 1000;
  if (d_inner <= 0) {
    throw new Error(
      `pipeWallThickness_mm (${pipeWallThickness_mm}) must be < pipeOuterDiameter_mm / 2 (${pipeOuterDiameter_mm / 2})`,
    );
  }

  const hasInsulation = insulationThickness_mm > 0;
  const d_outer_ins = hasInsulation
    ? d_outer_pipe + (2 * insulationThickness_mm) / 1000
    : d_outer_pipe;
  const hasJacket = hasInsulation && jacketThickness_mm > 0;
  const d_outer_jacket = hasJacket
    ? d_outer_ins + (2 * jacketThickness_mm) / 1000
    : d_outer_ins;

  // 1. Inner convective film.
  const R_conv_inner = 1 / (innerHtc_W_m2K * Math.PI * d_inner);

  // 2. Pipe wall conduction.
  const R_pipe_wall =
    Math.log(d_outer_pipe / d_inner) / (2 * Math.PI * pipeConductivity_W_mK);

  // 3. Insulation conduction.
  const R_insulation = hasInsulation
    ? Math.log(d_outer_ins / d_outer_pipe) /
      (2 * Math.PI * insulationConductivity_W_mK)
    : 0;

  // 4. Jacket conduction.
  const R_jacket = hasJacket
    ? Math.log(d_outer_jacket / d_outer_ins) /
      (2 * Math.PI * jacketConductivity_W_mK)
    : 0;

  // 5. Outer film: convective (air/channel) or soil shape factor (buried).
  let R_outer: number;
  if (installation === "buried") {
    if (2 * burialDepth_m < d_outer_jacket) {
      throw new Error(
        `burialDepth_m (${burialDepth_m}) must be ≥ d_outer_jacket / 2 (${d_outer_jacket / 2}) for the Carslaw-Jaeger shape factor`,
      );
    }
    R_outer =
      Math.log((2 * burialDepth_m) / d_outer_jacket) /
      (2 * Math.PI * soilConductivity_W_mK);
  } else {
    R_outer = 1 / (outerHtc_W_m2K * Math.PI * d_outer_jacket);
  }

  const R_total =
    R_conv_inner + R_pipe_wall + R_insulation + R_jacket + R_outer;
  const heatLossPerMeter_W = (fluidTemp_C - ambientTemp_C) / R_total;
  const surfaceTemperature_C = ambientTemp_C + heatLossPerMeter_W * R_outer;

  return {
    heatLossPerMeter_W,
    thermalResistance_mK_W: {
      convInner: R_conv_inner,
      pipeWall: R_pipe_wall,
      insulation: R_insulation,
      jacket: R_jacket,
      outer: R_outer,
      total: R_total,
    },
    surfaceTemperature_C,
  };
}

/**
 * Aggregate per-pipe heat-loss into the total network heat budget +
 * resulting fluid temperature drop along the path.
 *
 *   q_total = Σ(q'_i · L_i)               [W]
 *   ΔT     = q_total / (ṁ · c_p)          [K]
 *
 * When pipes carry different mass flows (e.g. branched network), pass
 * each segment's local ṁ — the function sums per-segment ΔT
 * contributions so the answer is correct under flow variation.
 *
 * @param pipes List of pipe segments. Each carries its heat loss per
 *   metre, length, and mass flow.
 * @param cp_J_kgK Optional specific heat override. Default 4187 (water
 *   at 82.5 °C mean DH temperature).
 */
export function computeTemperatureDropAlongPath(
  pipes: Array<{
    heatLossPerMeter_W: number;
    length_m: number;
    massFlow_kg_s: number;
  }>,
  cp_J_kgK: number = CP_WATER_J_KGK,
): { temperatureDrop_C: number; totalHeatLoss_W: number } {
  if (pipes.length === 0) {
    return { temperatureDrop_C: 0, totalHeatLoss_W: 0 };
  }
  let totalHeatLoss_W = 0;
  let temperatureDrop_C = 0;
  for (const p of pipes) {
    const segLoss = p.heatLossPerMeter_W * p.length_m;
    totalHeatLoss_W += segLoss;
    if (p.massFlow_kg_s > 0) {
      temperatureDrop_C += segLoss / (p.massFlow_kg_s * cp_J_kgK);
    }
  }
  return { temperatureDrop_C, totalHeatLoss_W };
}
