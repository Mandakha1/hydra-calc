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

  /* ===== Layer system (Phase 6E + 6.6) ===== */
  /** Per-layer visibility / lock / colour overrides. Sparse — any
   *  layer key not listed inherits its default from layers.ts.
   *  Persisted per project.
   *
   *  Layer key catalogue:
   *    Phase 6E (pipe roles): D2.1, D2.2, D3, D4, U1
   *    Phase 6.6 (drafting):  D (dimensions/text), C (construction) */
  layers?: Partial<Record<"D2.1" | "D2.2" | "D3" | "D4" | "U1" | "D" | "C", {
    visible?: boolean;
    locked?: boolean;
    color?: string;
    label?: string;
  }>>;

  /* ===== Snap engine (Phase 6B) ===== */
  /** Snap settings — persisted per project so each scheme remembers
   *  whether the engineer was using a 5-m or 10-m grid, 45° or 90°
   *  angle snap, etc. Each sub-setting is independently toggleable.
   *  Defaults: grid on/5 m, angle on/90°, endpoint on/12 px. */
  snapGrid?: { enabled: boolean; sizeM: 1 | 5 | 10 };
  snapAngle?: { enabled: boolean; incrementDeg: 15 | 30 | 45 | 90 };
  snapEndpoint?: { enabled: boolean; pixelThreshold: number };

  /* ===== Heat loss integration (Phase 5D) ===== */
  /** Whether the solver integrates pipe insulation heat loss into the
   *  mass-flow / pump-sizing calculation. Default true. Engineers
   *  comparing apples-to-apples with a legacy solver can opt out. */
  heatLossEnabled?: boolean;
  /** Project-wide default insulation type when a pipe doesn't override
   *  it. Looked up against INSULATION_TYPES from `heatLosses.ts`. */
  defaultInsulationKey?: string;
  /** Project-wide default insulation thickness in mm. Default 50 mm
   *  (matches ПИ-труба ГОСТ 30732 typical residential connection). */
  defaultInsulationThickness_mm?: number;
  /** Project-wide default pipe laying. Used when a pipe doesn't carry
   *  its own `laying` field. Mongolian residential default is
   *  "underground_channel" (concrete trench). */
  defaultLaying?: import("./nodeCatalog").PipeLaying;
  /** Ambient temp inside a concrete channel trench (°C). Default +10. */
  channelAmbientTemp_c?: number;
  /** Soil temperature at 1.5 m depth in design winter (°C). Default +5
   *  for УБ-region loam. */
  soilTempWinter_c?: number;
  /** Minimum supply temperature allowed at consumer inlet (°C, RULE-T01
   *  per БНбД 41-01-2019 §5.4). Default 80. */
  minSupplyTemp_c?: number;

  /* ===== Map / OSM background (Phase 5B.1) ===== */
  /** Tile-layer provider key (from MAP_PROVIDERS). Persisted so each
   *  project remembers whether the engineer prefers OSM, satellite,
   *  topo, etc. */
  mapProviderKey?: string;
  /** Background-tile opacity 0–1. Persisted alongside the provider. */
  mapOpacity?: number;
  /** Default map centre + zoom for this project. When the user clicks
   *  a Nominatim search result, this is updated so re-opening the
   *  project lands on the same view. */
  mapCenterLat?: number;
  mapCenterLon?: number;
  mapZoom?: number;

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
  /** Phase 5D — heat loss per metre (W/m), populated when the solver
   *  runs with heat-loss integration enabled. */
  heatLossPerMeter_W?: number;
  /** Phase 5B.1c / 5D — provenance of the length value used by the
   *  solver. "geometry" when Haversine derived it from node geo coords,
   *  "manual" when the engineer-typed length_m won. UI surfaces the
   *  source so engineers can spot drift. */
  lengthSource?: "geometry" | "manual";
}

export interface NodeResult {
  nodeId: string;
  pressureAtNode_mpa: number;
  heatLoad_w: number;
  /** Phase 5D — supply temperature at this node's inlet (°C),
   *  populated for consumers when heat-loss integration is enabled.
   *  Used by RULE-T01 norm check and by the piezometric temperature
   *  overlay. */
  supplyTemp_C_at_inlet?: number;
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
  /** Phase 5D — heat loss totals for the network. Populated when
   *  heat-loss integration is enabled (the default). */
  heatLoss?: {
    /** Sum of (q'_i · L_i) over all pipes (W). */
    totalHeatLoss_W: number;
    /** Heat loss as a fraction of total consumer load (0..1). */
    fractionOfLoad: number;
    /** Minimum supply temp at any consumer inlet (°C). The far-consumer
     *  number that the engineer sees in the panel. */
    minConsumerSupplyTemp_C: number;
    /** Source supply temp (°C) — for context in UI. */
    sourceSupplyTemp_C: number;
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
    | "material_temp"
    /** Phase 5D — supply temperature at a consumer dropped below the
     *  engineering minimum (default 80 °C per БНбД 41-01-2019 §5.4). */
    | "supply_temp_low";
  severity: "error" | "warning" | "info";
  message: string;
  target: { kind: "pipe" | "node"; id: string };
  threshold: number;
  actual: number;
  unit: string;
}

/**
 * Phase 6.6.1 — Dimension line entity.
 *
 * Drafting-style measurement annotation between two anchor nodes.
 * The anchor IDs are the source of truth — when both nodes exist,
 * the dimension's endpoints are computed live from them (so
 * dimensions follow on node move). When EITHER anchor is deleted,
 * the dimension falls back to the cached `*_xy` coords and renders
 * in an orphan state (red dashed) so the engineer notices and
 * either deletes it or re-anchors.
 *
 * The dimension's label defaults to auto-computed Haversine length
 * (when both nodes carry geo) or Euclidean pixel-distance otherwise.
 * Engineer can override via the `label` field for special cases
 * (e.g. "70м (max)", "≥30м", "X = ?").
 */
export interface SchemeDimension {
  id: string;
  /** Anchor — must reference a node id at creation time. */
  fromNodeId: string;
  /** Anchor — must reference a node id at creation time. */
  toNodeId: string;
  /** Perpendicular offset of the dimension line from the
   *  node-to-node axis, in SVG pixels. Positive = "above" when the
   *  axis runs left-to-right (engineer-intuitive). Default 30. */
  offset_px: number;
  /** Optional label override. When empty/undefined, the renderer
   *  computes the length from the live anchor positions. */
  label?: string;
  /** Layer assignment — "D" (Drafting, visible in print) or "C"
   *  (Construction, hidden by default in print). Default "D". */
  layerKey?: "D" | "C";
  /** Cached anchor positions for orphan fallback. Updated on every
   *  successful render that resolves both anchors. */
  fromNode_cached_xy?: { x: number; y: number };
  toNode_cached_xy?: { x: number; y: number };
}

/** Phase 6.5.5 — single undo/redo snapshot.
 *  Captures the minimum state needed to roll back / replay a batch
 *  operation: nodes + pipes + the two selection surfaces. Settings
 *  / results are NOT snapshot — they're orthogonal to undoable
 *  drawing operations. */
export interface UndoSnapshot {
  /** Mongolian short label for toast feedback. "Эргүүлэлт",
   *  "Шугаман массив", "Бөгөмөөр устгасан", etc. */
  label: string;
  /** Count of nodes affected — surfaced in the toast next to label. */
  affectedCount: number;
  nodes: SchemeNode[];
  pipes: SchemePipe[];
  /** Phase 6.6.1 — kind union extended with "dimension". */
  selection: { kind: "node" | "pipe" | "dimension"; id: string } | null;
  multiSelection: { nodeIds: string[]; pipeIds: string[]; dimensionIds?: string[] };
  /** Phase 6.6.1 — dimensions snapshot for batched op undo. */
  dimensions?: SchemeDimension[];
}

export type HydraulicState = {
  nodes: SchemeNode[];
  pipes: SchemePipe[];
  settings: ProjectSettings;
  results?: CalculationResults;
  violations?: NormViolation[];
  schemaVersion: 5;
  /** Phase 6.5.5 — last N snapshots (capped at MAX_UNDO_DEPTH=50).
   *  Each entry is the pre-mutation state of one batch op.
   *  Optional so legacy serialised projects without these arrays
   *  still load cleanly. */
  undoStack?: UndoSnapshot[];
  /** Redo buffer — populated when the user pops the undo stack.
   *  Cleared on any new batch operation. */
  redoStack?: UndoSnapshot[];
  /** Phase 6.6.1 — dimension-line entities. Optional so legacy
   *  projects without drafting aids load cleanly. */
  dimensions?: SchemeDimension[];
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
