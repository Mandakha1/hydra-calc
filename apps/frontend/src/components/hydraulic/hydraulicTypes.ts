/**
 * Domain types for the hydraulic calculator.
 * Kept local to the frontend — backend stores them as opaque JSONB.
 */

/**
 * Legacy 5-value enum — kept for backward compatibility.
 * Real classification lives in `nodeCatalog.NODE_KINDS` (30+ kinds).
 */
export type NodeKind =
  | "source" | "consumer" | "junction" | "pump" | "well"
  | string; // any nodeCatalog key

export interface SchemeNode {
  id: string;
  kind: NodeKind;
  label: string;
  /** Scheme-space pixel coords (user-visible canvas units). */
  x: number;
  y: number;
  /** Optional real-world coords for OSM integration. */
  geo?: { lat: number; lon: number };
  /** Heat load in watts (for consumers). */
  heatLoad_w?: number;
  /** Required pressure at this consumer, MPa. */
  requiredPressure_mpa?: number;
  /** For buildings: envelope inputs that drive heat-load computation. */
  envelope?: BuildingEnvelope;
  /** Elevation in meters (for static head). */
  elevation_m?: number;
  /** For pumps: design point. */
  pump?: { H_m: number; Q_m3h: number };
  /** For wells/ИТП: preset equipment key. */
  equipment?: string;
  /** Local resistance ζ — for valves/fittings. */
  zeta?: number;
  /** Whether valve is open (for valve_*). */
  isOpen?: boolean;
  /** Building floors (for consumers). */
  floors?: number;
  /** Floor area m² (for consumers). */
  floor_area_m2?: number;
  /** Floor height m — default 3.0m. */
  floorHeight_m?: number;
  /** Building height m (auto: floors × floorHeight_m). */
  buildingHeight_m?: number;
  /** Total volume m³. */
  volume_m3?: number;
  /** Building footprint polygon (pixel coords). Closed = polygon, open = polyline.
   *  When drawn on a map, each vertex may also carry { lat, lon } so it tracks
   *  the leaflet map view (otherwise the polygon stays put while map moves). */
  footprint?: Array<{ x: number; y: number; lat?: number; lon?: number }>;
  /** Auto-derived footprint area in m². */
  footprintArea_m2?: number;
  /** Width in meters (for simple rectangle building). */
  width_m?: number;
  /** Height in meters (for simple rectangle building — depth/length on plan). */
  height_m?: number;
  /** Specific heat load (W/m³) — used to auto-compute heatLoad_w from volume. */
  specificLoad_w_per_m3?: number;
  /** Hatch fill pattern for building footprint / plan-view rectangle. AutoCAD-style.
   *  - "solid"     — semi-transparent fill (default)
   *  - "diag45"    — 45° parallel lines (concrete / standard)
   *  - "diag135"   — 135° parallel lines (alternate)
   *  - "cross"     — 90° cross-hatch (brick / industrial)
   *  - "brick"     — running-bond brick pattern
   *  - "dots"      — dotted (gravel / fill)
   *  - "none"      — outline only, no fill */
  hatchPattern?: "solid" | "diag45" | "diag135" | "cross" | "brick" | "dots" | "none";
  notes?: string;

  /* ============== ZULU-COMPATIBLE FIELDS (per .zulu-research/zulu-findings.md) ============== */
  /** Zulu (_uzvvod, _ctp): street address. */
  adres?: string;
  /** Zulu (_uzvvod, _ctp): building height in meters. */
  hzdan?: number;
  /** Zulu (_uzvvod, _ctp): apartment / occupant count. */
  njil?: number;
  /** Zulu (_uzvvod, _ctp, _drossel): ИТП scheme № from Politerm 46-catalog (1-46). */
  n_schem?: number;
  /** Zulu (_uzvvod, _ctp): heat load coefficients. */
  kso?: number; ksv?: number; kgv?: number; kb?: number;
  /** Zulu (_ctp, _uzvvod): heat exchanger section config (lower / upper). */
  nsec_so?: number; ngr_so?: number; hsec_so?: number;
  /** Zulu (_uzvvod): elevator config — nozzle # + diameter (mm) + computed/actual mix coef. */
  nel?: number; dsop_mm?: number; u_calc?: number; u_fakt?: number;
  /** Zulu (_uzvvod, _ctp): regulators present (boolean flags 0/1). */
  regul_g?: number; regul_t?: number; klapan_sv?: number;
  /** Zulu (_ctp): reserve head margin (m). */
  hzapas?: number;
  /** Zulu (_uzvvod, _ctp): inlet temperature breakdowns (calculation/test). */
  t1_r?: number; t2_r?: number; t3_r?: number; tnv_r?: number;
  /** Zulu (_uzvvod, _ctp): heating load (Гкал/ч), DHW load avg/max. */
  qo_r?: number; qsv_r?: number; qgv_r?: number; qgv_sred?: number; qgv_max?: number;
  /** Zulu (_istok, _kamera, _ctp, _uzvvod): post-calc heat-loss totals (W). */
  qpot_ts?: number; qut_pod?: number; qut_obr?: number; qut_potr?: number;
  /** Zulu (_istok): cost per unit (₽/Gcal, ₽/W). */
  cost_q?: number; cost_w?: number;
  /** Zulu (_kamera, _ctp, _uzvvod, _drossel): post-calc results — supply/return at this point. */
  result_h_pod_m?: number; result_h_obr_m?: number;
  result_p_pod_mpa?: number; result_p_obr_mpa?: number;
  result_t_pod_c?: number; result_t_obr_c?: number;
  result_g_pod_kg_s?: number; result_g_obr_kg_s?: number;
  /** Zulu (_kamera, _ctp): cumulative distance from source (m), transit time (s). */
  result_dist_from_src_m?: number;
  result_transit_time_s?: number;
  /** Zulu (_drossel): orifice washer config — diameter (mm) × count in series. */
  dshb_pod_mm?: number; nshb_pod?: number;
  dshb_obr_mm?: number; nshb_obr?: number;
  dshb_gvs_mm?: number; nshb_gvs?: number;
  /** Zulu (_drossel): bypass pipe config. */
  dbp_pod_mm?: number; lbp_pod_m?: number;
  /** Zulu (_drossel): regulator characteristic (Kv valve coef). */
  kv_pod?: number; kv_obr?: number;
  /** Zulu (_ZADVIGKA): valve manufacturer mark text. */
  mark_pod?: string; mark_obr?: string;
  /** Zulu (_ZADVIGKA): valve % open per circuit (1.0 = fully open). */
  per_pod?: number; per_obr?: number;
  /** Zulu (_uzvvod, _ctp): per-section computed values for plate HX (lower section). */
  t11_niz?: number; t12_niz?: number; t21_niz?: number; t22_niz?: number;
  q_niz?: number; gniz?: number; g2_niz?: number;
  /** Plate HX (upper section). */
  t11_verh?: number; t12_verh?: number; t21_verh?: number; t22_verh?: number;
  q_verh?: number; gverh?: number; g2_verh?: number;
}

export interface BuildingEnvelope {
  /** Total floor area m². */
  floor_area_m2: number;
  /** Aimag / city key (CLIMATE[].city). */
  city: string;
  /** Building use — determines ACH and indoor temp. */
  use: "residential" | "office" | "retail" | "industrial" | "school" | "hospital";
  /** Envelope surfaces — each with area, wall type key, optional orientation correction. */
  surfaces: EnvelopeSurface[];
  /** Internal volume for infiltration. */
  volume_m3?: number;
}

export interface EnvelopeSurface {
  id: string;
  wallTypeKey: string;
  area_m2: number;
  orientation?: "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW";
  isCorner?: boolean;
}

export interface SchemePipe {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  label?: string;
  /** Material key from PIPE_MATERIALS (e.g. "steel_aged", "ppr_fr"). */
  materialKey: string;
  /** Nominal diameter. Must exist in PIPE_DB[materialCategory]. */
  dn: number;
  /** Pipe length in meters — either explicit or computed from node coords. */
  length_m: number;
  /** Override roughness (mm). If undefined, material default used. */
  roughness_mm?: number;
  /** Local resistance count per fitting. */
  fittings?: Record<string, number>;
  /** Parallel pipe (supply/return treated as same hydraulic path). */
  isReturn?: boolean;
  /** Hydraulic circuit (multi-system: supply/return/DHW/cold). */
  circuit?: import("./nodeCatalog").PipeCircuit;
  /** Laying — drives heat-loss calc. */
  laying?: import("./nodeCatalog").PipeLaying;
  /** Burial depth (m) — for underground laying. */
  burialDepth_m?: number;
  /** Insulation type key (from heatLosses.INSULATION_TYPES). */
  insulationKey?: string;
  /** Insulation thickness (mm). */
  insulationThickness_mm?: number;
  /** Polyline waypoints — intermediate vertices for right-angle bends. */
  waypoints?: Array<{ x: number; y: number }>;

  /* ============== ZULU-COMPATIBLE PIPE FIELDS ============== */
  /** Zulu (_uch.Dpod): supply line diameter in mm — separate from return. */
  dpod_mm?: number;
  /** Zulu (_uch.Dobr): return line diameter in mm. */
  dobr_mm?: number;
  /** Zulu (_uch.Ke_pod): equivalent roughness, supply (mm). */
  ke_pod_mm?: number;
  /** Zulu (_uch.Ke_obr): equivalent roughness, return. */
  ke_obr_mm?: number;
  /** Zulu (_uch.Zarost_pod): pipe scaling/corrosion factor (multiplier). */
  zarost_pod?: number; zarost_obr?: number;
  /** Zulu (_uch.Kz_pod): utilization coefficient. */
  kz_pod?: number; kz_obr?: number;
  /** Zulu (_uch.Spod): characteristic friction (computed back). */
  spod?: number; sobr?: number;
  /** Zulu (_uch.Proklad): laying type code (1-5). */
  proklad?: number;
  /** Zulu (_uch.Norma): applied design standard text. */
  norma?: string;
  /** Zulu (_uch.Hzal): burial depth (m). */
  hzal_m?: number;
  /** Zulu (_uch.Izol_pod): insulation type code (1-30). */
  izol_pod_code?: number;
  /** Zulu (_uch.Grunt): soil type code. */
  grunt?: number;
  /** Zulu (_uch.StatZone): static pressure zone identifier. */
  statZone?: number;
  /** Zulu (_uch.Use_pod): in-service flag (0=not in calc, 1=normal). */
  use_pod?: number; use_obr?: number;
  /** Zulu (_uch.Kpoprav): correction factor. */
  kpoprav?: number; kpop_obr?: number;
  /** Post-calc: result_v_pod, result_dp_pod separately for supply / return. */
  result_g_pod_kg_s?: number; result_g_obr_kg_s?: number;
  result_v_pod_m_s?: number; result_v_obr_m_s?: number;
  result_dp_pod_pa?: number; result_dp_obr_pa?: number;
}

export interface ProjectSettings {
  /** Network type — informational. */
  networkType: "two_pipe_closed" | "two_pipe_open" | "four_pipe";
  /** Temperature schedule key (e.g. "130_70"). */
  temperatureScheduleKey: string;
  /** Design outdoor temperature, °C. Overrides city default if set. */
  designOutdoorTemp_c?: number;
  /** Aimag/city key used for climate lookup. */
  city: string;
  /** Pipe material category — drives PIPE_DB table selection.
   *  - "steel": standard ГОСТ 10704-91 (DN65 → OD 76 / ID 68, etc)
   *  - "steel_v_group": ГОСТ 10704-91 V-group thin-wall (DN65 → OD 65 / ID 60),
   *    the convention used by Mongolian residential project paperwork.
   *  - "ppr" / "pehd": polymer tables. */
  primaryMaterialCategory: "steel" | "steel_v_group" | "ppr" | "pehd";
  /** Fraction of head loss added for local losses (default 0.3). */
  localLossesFraction: number;
  /** Water supply pressure at source, MPa (typical 0.6 MPa). */
  sourcePressure_mpa: number;

  /* ===== Zulu-compatible seasonal averages + economics (per Zulu istok) ===== */
  /** Seasonal mean supply temperature, °C. */
  tsg_pod_c?: number;
  /** Seasonal mean return temperature, °C. */
  tsg_obr_c?: number;
  /** Seasonal mean soil temperature, °C. */
  tsg_grunt_c?: number;
  /** Seasonal mean outdoor temperature, °C. */
  tsg_nv_c?: number;
  /** Seasonal mean basement temperature, °C. */
  tsg_podval_c?: number;
  /** Heat tariff (₮/Gcal or ₽/Gcal). */
  cost_q?: number;
  /** Electricity tariff. */
  cost_w?: number;
  /** Heating period code (1=year-round, 2=winter only). */
  period?: number;
  /** Source identifier (Zulu Nist field). */
  nist?: number;
}

export interface PipeResult {
  pipeId: string;
  G_kg_s: number;
  v_m_s: number;
  Re: number;
  lambda: number;
  headlossPerMeter_pa: number;
  totalPressureDrop_pa: number;
  iterations: number;
}

export interface NodeResult {
  nodeId: string;
  pressureAtNode_mpa: number;
  heatLoad_w: number;
}

export interface CalculationResults {
  pipes: PipeResult[];
  nodes: NodeResult[];
  /** Sum of all consumer heat loads (W). */
  totalLoad_w: number;
  /** Worst-case head loss (Pa/m). */
  maxHeadlossPerMeter_pa: number;
  /** Worst-case velocity (m/s). */
  maxVelocity_m_s: number;
  /** Minimum consumer pressure (MPa). */
  minConsumerPressure_mpa: number;
  /** Pump duty — H (m water column), Q (m³/h), P (kW). */
  pump?: {
    H_m: number;
    Q_m3h: number;
    P_kW: number;
    /** Optional metre-by-metre breakdown of how H_m was assembled.
     *  Populated by sizePump() since the DISCREPANCY-002 fix (Phase 5A);
     *  UI panels render it for transparency. */
    breakdown?: {
      supplyFriction_m: number;
      returnFriction_m: number;
      consumerReserve_m: number;
      safetyMargin_m: number;
    };
  };
  /** ISO timestamp when results were computed. */
  computedAt: string;
}

export interface NormViolation {
  kind:
    | "velocity_high"
    | "velocity_low"
    | "headloss_high"
    | "pressure_low"
    | "temperature_mismatch"
    | "material_pressure"
    | "material_temp";
  severity: "error" | "warning" | "info";
  message: string;
  target: { kind: "pipe" | "node"; id: string };
  threshold: number;
  actual: number;
  unit: string;
}

export type HydraulicState = {
  nodes: SchemeNode[];
  pipes: SchemePipe[];
  settings: ProjectSettings;
  results?: CalculationResults;
  violations?: NormViolation[];
  schemaVersion: 5;
};

/** Default state for a fresh project. */
export function emptyState(): HydraulicState {
  return {
    nodes: [],
    pipes: [],
    settings: {
      networkType: "two_pipe_closed",
      temperatureScheduleKey: "95_70",
      city: "Улаанбаатар",
      primaryMaterialCategory: "steel",
      localLossesFraction: 0.3,
      sourcePressure_mpa: 0.6,
    },
    schemaVersion: 5,
  };
}
