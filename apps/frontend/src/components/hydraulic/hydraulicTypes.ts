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
  /** Phase 6.8.3 — per-entity symbol-size override.
   *  Multiplies the project-wide `symbolSizePreset` so an engineer can
   *  shrink ONE oversized ЦТП (`0.7`) or enlarge ONE landmark АОС (`1.5`)
   *  without touching the global preset. Expected range 0.3..2.5; the
   *  result still clamps to [MIN_SYMBOL_PX, MAX_SYMBOL_PX]. Default 1.0
   *  (no override) — undefined behaves identically. */
  size_scale?: number;

  /* ============== PHASE 8.3 — Well / chamber detail dimensions ============== */
  /** Chamber inside length (m). Used by the ҮХТ Well Detail view to
   *  render the cross-section rectangle to true scale. Only meaningful
   *  on `well_*` / `chamber` kinds. Default rendering when undefined:
   *  3 m × 2 m × 2.5 m (typical Mongolian small heating chamber). */
  chamber_length_m?: number;
  /** Chamber inside width (m). See chamber_length_m. */
  chamber_width_m?: number;
  /** Chamber inside depth (m). Drives the vertical extent of the
   *  cross-section view. */
  chamber_depth_m?: number;
  /** Manhole cover diameter (mm). Default 700 mm (standard concrete
   *  manhole ring) when undefined. */
  coverDiameter_mm?: number;

  /* ============== PHASE 8.4 — Compensator detail dimensions ============== */
  /** Compensator bend radius (mm). For Ω-bends (compensator_u): the
   *  radius of the semicircular top. For sильfон (compensator_bellow):
   *  the OD of the accordion convolution. Default 500 mm when
   *  undefined. */
  bendRadius_mm?: number;
  /** Arm height (m). Vertical reach of an Ω-bend's two arms (the
   *  distance from the pipe centerline up to the start of the
   *  semicircle). Default 1.2 m. */
  armHeight_m?: number;
  /** Span (m). Horizontal distance between the two compensator arms
   *  at the pipe centerline. For bellows it's the total expansion
   *  length. Default 2.0 m. */
  span_m?: number;
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
  /** Polyline waypoints — intermediate vertices for right-angle bends.
   *  Phase 6 legacy. Phase 12.3 introduces `bendPoints` with richer
   *  lat/lon support; renderer prefers bendPoints when set, falls back
   *  to waypoints for legacy projects. */
  waypoints?: Array<{ x: number; y: number }>;
  /** Phase 12.3 — intermediate bend points between from/to nodes.
   *  Each point carries scheme-px coords + optional lat/lon for map-
   *  tracking (just like SchemeBuilding.polygon vertices). When empty
   *  or undefined, pipe renders as a single straight segment from
   *  fromNode → toNode (existing behaviour). When set, pipe renders
   *  as a polyline through these points.
   *
   *  Geometry-only: length_m on SchemePipe remains AUTHORITATIVE for
   *  hydraulics. Drift between geometry-length and length_m surfaces
   *  as an Inspector advisory when > 5%. */
  bendPoints?: Array<{ x: number; y: number; lat?: number; lon?: number }>;
  /** Phase 12.3 — angle constraint during drawing / dragging.
   *  'free' (default) — any angle, no snap
   *  'snap_45' — snaps to 0/45/90/135/180° increments
   *  'snap_90' — snaps to 0/90/180/270° only
   *  Shift key during drag temporarily activates snap_45 regardless. */
  anglePolicy?: "free" | "snap_45" | "snap_90";
  /** Phase 12.5 — reference to the parent SchemeChannel when this pipe
   *  is contained inside a composite underground channel (Л-4/Л-7/Л-9
   *  per ГК-23/02). When set, the channel renders one thick polyline
   *  representing all contained pipes; individual pipes don't render
   *  separately on the plan (the channel covers visually). Calc engine
   *  still processes each pipe individually — channel is UI-only. */
  channelId?: string;

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

/**
 * Phase 6.7.2 — Title-block metadata.
 *
 * The engineer-facing "Зургийн тамга" rendered bottom-right of the
 * canvas as a preview of how the printed page will look. Field set
 * follows ГОСТ 21.501 + Mongolian engineering practice — 11
 * editable rows + a derived scale row that follows
 * `ProjectSettings.printScale` (so changing the scale dropdown
 * keeps the title block in sync without a manual edit).
 *
 * Signature boxes for engineer / checker / approver are RENDERED
 * empty so the engineer can hand-sign after print. Digital
 * signatures are out of scope for Phase 6.7.
 */
export interface TitleBlockMeta {
  /** "Зургийн нэр" — drawing title. Default
   *  "Дулааны магистрал шугам — план". */
  drawingTitle?: string;
  /** "Төслийн код" — project / object code (e.g. "TS-2026-014"). */
  projectCode?: string;
  /** "Зурсан" — engineer who drew the plan. */
  engineer?: string;
  /** "Шалгасан" — engineer who checked it. */
  checker?: string;
  /** "Бат. зөвш." — approver. Empty rows still render (so the
   *  signature box is present) but the name above stays blank. */
  approver?: string;
  /** "Фирм" — design firm / company name. */
  company?: string;
  /** "Хаяг" — construction site / project address. Multi-line OK. */
  address?: string;
  /** "Огноо" — ISO YYYY-MM-DD. Renderer falls back to today when
   *  unset; SettingsPanel exposes a "Өнөөдөр" preset button. */
  date?: string;
  /** "Сэргээлт" — revision number / letter (e.g. "0", "A", "2.1"). */
  revision?: string;
  /** "Хуудас" — sheet number string (e.g. "1/1", "2/3"). */
  sheetNumber?: string;
  /** "Стандарт" — standards footer. Editable so the engineer can
   *  add firm-specific or project-specific standards alongside the
   *  national defaults. */
  standardsFooter?: string;
}

/**
 * Phase 6.7.3 — North arrow metadata.
 *
 * Drafting-style north marker rendered viewport-anchored at the
 * canvas top-right corner by default. The persisted position is in
 * VIEWPORT pixels (not scheme-space) so the arrow stays in its
 * corner regardless of canvas pan / zoom. Rotation is applied about
 * the arrow's own centre — engineer aligns it with the project's
 * grid when the site's local coordinates aren't oriented to true
 * north (a common case in older Mongolian municipal surveys).
 *
 * All fields optional; `applyNorthArrowDefaults` fills missing
 * fields using the viewport dimensions at render time.
 */
export interface NorthArrowMeta {
  /** Anchor in viewport-px from the SVG's top-left. */
  x_px?: number;
  y_px?: number;
  /** Rotation in degrees about the arrow centre. Default 0 = up.
   *  Positive = clockwise (matches drafting convention; opposite of
   *  the mathematical counter-clockwise sign used in transforms.ts
   *  for nodes — the north arrow has a fixed engineering reading
   *  direction). */
  rotation_deg?: number;
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

  /* ===== Print / scale (Phase 6.7.1) =====
   *
   *  These three settings drive the on-canvas scale bar (Phase 6.7.1)
   *  and the PDF exporter (Phase 6.7.4). All optional with defaults
   *  applied at the read sites so legacy projects load cleanly.
   *
   *  Engineering convention (БНбД / СП 41-101 drawings):
   *    Residential plot networks → 1:200 or 1:500
   *    District trunk networks   → 1:1000 or 1:2000
   *  Mongolian engineers print on A3 most often; A4 is for ITP
   *  sub-prints and approval copies. */
  /** Drafting scale as displayed on the title block + scale bar.
   *  Default "1:500". */
  printScale?: "1:200" | "1:500" | "1:1000" | "1:2000";

  /** Phase 6.8.3 — project-wide symbol-size preset.
   *  Multiplies every entity's computed radius. Phase 13.0 widened
   *  from 3 tiers → 5 per engineer feedback (АОС/Source хэт том):
   *    - "xs"     → 0.5×  (dense overview — symbols don't obscure OSM footprints)
   *    - "small"  → 0.7×  (overview / dense cluster diagrams)
   *    - "medium" → 1.0×  (default — calibrated for typical UB
   *                        residential plans at zoom 16)
   *    - "large"  → 1.3×  (presentation / hand-signed prints)
   *    - "xl"     → 1.6×  (large-format print / projector display)
   *  Per-entity `size_scale` multiplies on top, so a single oversized
   *  ЦТП can still be tamed without dragging the whole project.
   *  Keyboard `[` / `]` cycles through tiers in SchemeEditor. */
  symbolSizePreset?: "xs" | "small" | "medium" | "large" | "xl";
  /** Paper size — only A3 + A4 are supported in 6.7. */
  printPaperSize?: "A3" | "A4";
  /** Paper orientation. Default "landscape" (the Mongolian convention
   *  for hydraulic plans). */
  printOrientation?: "portrait" | "landscape";

  /** Title-block metadata (Phase 6.7.2) — the engineer-facing
   *  "Зургийн тамга" stamp rendered bottom-right of the canvas and
   *  reproduced on the printed page. All fields optional; the
   *  renderer applies sensible defaults (today's date for `date`,
   *  the canonical Mongolian standards string for `standardsFooter`,
   *  etc.) at read time so legacy projects load cleanly. */
  titleBlock?: TitleBlockMeta;

  /** North-arrow metadata (Phase 6.7.3). Singleton-per-project
   *  drafting marker rendered at viewport top-right by default.
   *  Engineer drags it to reposition + uses an Inspector rotation
   *  slider to align it with the project's grid (Mongolian site
   *  coordinates occasionally deviate from true north). All fields
   *  optional — `applyNorthArrowDefaults` fills them in at render. */
  northArrow?: NorthArrowMeta;

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
    /** Phase 6.7.4 — separate flag for PDF output. Default mirrors
     *  drafting convention (see DEFAULT_LAYERS in scheme/layers.ts). */
    printVisible?: boolean;
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

  /* ===== Drawing tool UX (Phase 12) ===== */
  /** Phase 12.1 — after engineer places one entity, return to the
   *  default (select) tool instead of staying in placement mode.
   *  Default false (one-at-a-time placement) — engineer-feedback
   *  preference. Set to true to enable continuous placement (Phase
   *  6.x default behaviour). */
  continuousPlacement?: boolean;
  /** Phase 12.2 — when true, every drawn pipe shows a persistent
   *  midpoint length label on the canvas (toggled via 'D' shortcut).
   *  Default true. The live HUD next to the cursor shows during
   *  active drawing regardless of this setting. */
  showLiveDimensions?: boolean;
  /** Phase 12.8 — when true, every node shows the engineering cross-
   *  reference number badge ("01", "02", …) at upper-right. Default
   *  true. Engineer turns off for cleaner low-zoom overview prints. */
  showNodeNumbers?: boolean;
  /** Phase 12.8 — when true, every pipe shows a small chevron at the
   *  midpoint indicating flow direction (geometric or solver-driven).
   *  Default true. Channel-contained pipes always skip arrows since
   *  the channel renders its own direction cue. */
  showFlowArrows?: boolean;
  /** Phase 12.8b — project-wide toggle for the Phase 12.7 channel
   *  label panels. When false every channel hides its 3-line callout
   *  regardless of per-channel `labelVisible`. Default true. */
  showChannelLabels?: boolean;

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

/**
 * Phase 6.6.2 — Construction line entity.
 *
 * Free-standing drafting guide line (centre-line, axis, alignment
 * aid). UNLIKE dimensions, construction lines:
 *   - have free XY endpoints (no anchor nodes, no orphan state)
 *   - don't auto-compute a label — engineer types their own (axis
 *     name "А-А", "Х-Х", or leaves blank)
 *   - live on layer "C" by default (hidden in print unless toggled)
 *
 * The line is rendered with a configurable stroke style — dashed by
 * drafting convention, but engineers can override to solid/dotted.
 */
export interface SchemeConstructionLine {
  id: string;
  /** Free endpoint in scheme-space pixels. */
  from: { x: number; y: number };
  to: { x: number; y: number };
  /** Optional free-text label — typically an axis name like "А-А".
   *  Rendered centred on the line, with white halo for legibility. */
  label?: string;
  /** Layer assignment — "C" (Construction, hidden by default in
   *  print) or "D" (Drafting, visible in print). Default "C". */
  layerKey?: "C" | "D";
  /** Line stroke style — "dashed" (drafting default), "solid"
   *  (centre-line / heavy axis), "dotted" (alignment aid). */
  style?: "dashed" | "solid" | "dotted";
  /** Phase 6.8.2 — optional geo anchors for the two endpoints.
   *  Stamped at create time when the map is visible so the
   *  construction line tracks the leaflet map view on pan / zoom
   *  (same contract as `SchemeNode.geo`). The `from` / `to` pixel
   *  coords remain the source of truth and the canvas-only
   *  fallback; the `geo*` fields are the map-tracking overlay.
   *  Codebase convention: `lon`, not `lng`. */
  geoFrom?: { lat: number; lon: number };
  geoTo?: { lat: number; lon: number };
}

/**
 * Phase 6.8.6 — Reference building entity.
 *
 * Standalone polygon drawn on the canvas / map as a building
 * outline. Distinct from "consumer-node-with-footprint" (which
 * carries a full BuildingEnvelope + heat-load computation):
 *
 *   - SchemeBuilding has NO hydraulic role. It's a polygon plus
 *     a few engineer-friendly metadata fields (floors, type, an
 *     optional heat load estimate).
 *   - It's NOT connected to pipes. To bring it into the
 *     hydraulic network, the engineer drops a consumer node on
 *     top of the building (or converts it via a future
 *     Inspector action).
 *
 * Geo-anchoring follows the Phase 6.8.2 pattern — each polygon
 * vertex may carry an optional `{lat, lon}` so the building
 * tracks the leaflet map view on pan / zoom.
 */
export interface SchemeBuilding {
  id: string;
  /** Polygon vertices in scheme-pixel coords. Closed implicitly
   *  (renderer connects last vertex to first). Min 3 vertices.
   *  Each vertex may carry optional `{lat, lon}` for map
   *  tracking; the renderer projects lat/lon → scheme-px live
   *  when the map is visible. */
  polygon: Array<{ x: number; y: number; lat?: number; lon?: number }>;
  /** Engineer-typed name (e.g. "АОС-15", "Сургууль-3"). */
  label?: string;
  /** Storey count. Used for the centroid annotation + future
   *  area × floors × specificLoad heat-load estimate. */
  floors?: number;
  /** Coarse building-type tag. Matches the most common use
   *  cases in Mongolian residential heating projects. The
   *  Inspector dropdown renders these 5 options + an "other"
   *  fall-through. */
  building_type?: "apartment" | "school" | "hospital" | "office" | "industrial";
  /** Optional engineer-typed heat-load estimate in kW. Stored
   *  here so the engineer can sketch a load on the plan without
   *  building a full BuildingEnvelope. Solver does NOT use this
   *  unless a consumer node references the building. */
  heatLoad_kw?: number;
  /** Layer assignment — defaults to "D" (Drafting, visible in
   *  print). Engineer can move to "C" to hide on print. */
  layerKey?: "D" | "C";
  /** Optional colour override for the fill / stroke. When
   *  undefined, the renderer picks the layer colour. */
  color?: string;
  /** Phase 12.1 — engineer tagged this building as a specific
   *  entity kind via the right-click "Энэ юу вэ?" workflow. When
   *  set, the building represents that entity on the network. The
   *  node is auto-created at the building centroid and stored in
   *  `taggedAsNodeId`. Engineer can re-tag (changes kind) or
   *  un-tag (clears both fields + deletes auto-created node). */
  taggedAsKind?: string;
  /** Phase 12.1 — id of the SchemeNode created when this building
   *  was tagged. Stays in sync — deleting the building deletes
   *  this node; deleting the node clears `taggedAsKind` /
   *  `taggedAsNodeId` on the building (but leaves the outline). */
  taggedAsNodeId?: string;
}

/**
 * Phase 12.5 — Composite underground pipe channel.
 *
 * Represents the physical concrete channel (Л-4 / Л-7 / Л-9 per
 * ГК-23/02 series Г-991-1) that contains 1-5 SchemePipe entities
 * sharing geometry. Engineer draws ONE polyline = creates the channel
 * + N contained pipes atomically.
 *
 * Per the GK-23/02 reference:
 *   Л-4 600×450 — small branch (2 pipes: D2.1 + D2.2)
 *   Л-7 1200×580 — medium branch (4-5 pipes: + D3 + D4 + optional У1)
 *   Л-9 1500×610 — main trunk (5 pipes: all circuits)
 *
 * Channel is UI grouping ONLY — calc engine processes each contained
 * pipe individually (Hardy-Cross loops, Darcy-Weisbach, etc.). The
 * channel just provides shared geometry + composite rendering on plan +
 * cross-section detail view (Phase 12.6) + label panel (Phase 12.7).
 *
 * Geo-anchoring follows the Phase 6.8.2 / 12.3 pattern — bendPoints
 * may carry optional {lat, lon} for map tracking.
 */
export interface SchemeChannel {
  id: string;
  type?: "channel";  // discriminant for future polymorphism
  fromNodeId: string;
  toNodeId: string;
  /** Intermediate bend points (same shape as SchemePipe.bendPoints).
   *  Channel polyline renders through these points; contained pipes
   *  inherit the geometry. */
  bendPoints?: Array<{ x: number; y: number; lat?: number; lon?: number }>;
  /** Same convention as SchemePipe.anglePolicy. */
  anglePolicy?: "free" | "snap_45" | "snap_90";

  /* ===== Channel physical properties (from GK_DATA.channelTypes) ===== */
  /** Channel series per Mongolian СЕРИЯ Г-991-1. 'custom' lets engineer
   *  define own dimensions (e.g. retrofit work with non-standard channel). */
  channelType?: "Л-4" | "Л-7" | "Л-9" | "custom";
  /** Concrete channel inside width in millimetres. Set automatically
   *  from CHANNEL_TYPE_REGISTRY when channelType is standard. */
  crossSectionWidth_mm?: number;
  /** Concrete channel inside height in millimetres. */
  crossSectionHeight_mm?: number;
  /** Burial depth from grade in metres (used by Phase 8.1 longitudinal
   *  profile when the channel intersects the magistral path). */
  burialDepth_m?: number;

  /* ===== Contained pipes ===== */
  /** Ordered list of SchemePipe IDs sharing this channel's geometry.
   *  Phase 12 minimum: 1 pipe. Maximum: 5 (D2.1 + D2.2 + D3 + D4 + У1).
   *  Order doesn't affect calc — it controls visual position inside
   *  the cross-section detail view (Phase 12.6). */
  pipeIds: string[];

  /* ===== Phase 12.7 label panel positioning ===== */
  /** Engineer-manual offset for the AutoCAD-style label panel rendered
   *  adjacent to the channel midpoint. Default: 20px perpendicular to
   *  channel direction. */
  labelOffset?: { dx: number; dy: number };
  /** Per-channel toggle — overrides global ProjectSettings.showPipeLabels.
   *  Default undefined (inherit global). */
  labelVisible?: boolean;
}

/**
 * Phase 6.6.3 — Text annotation entity.
 *
 * Free-positioned drafting text — engineer-typed notes, axis labels,
 * room names, callout markers ("УДДТ-1", "ХУУ ороход дугуй болгох",
 * "Φ80 — 100м"). UNLIKE dimensions (anchor-bound) and construction
 * lines (start/end coords), annotations are a single-anchor entity
 * with rotation + alignment + font size as the engineer's primary
 * controls.
 *
 * Default layer is "D" (Drafting — visible in print). Engineer can
 * move to "C" (Construction — hidden in print) for working notes.
 */
export interface SchemeAnnotation {
  id: string;
  /** Anchor position in scheme-space pixels. */
  x: number;
  y: number;
  /** Text content. Newlines split into multi-line SVG tspans on
   *  render. May be empty briefly while engineer is typing. */
  text: string;
  /** Font size in SVG pixels. Default 12. */
  fontSize_px?: number;
  /** Rotation in degrees about the anchor. Default 0 (horizontal).
   *  Positive = counter-clockwise (matches transforms.ts convention). */
  rotation_deg?: number;
  /** Text alignment relative to (x, y). Default "left". */
  align?: "left" | "center" | "right";
  /** Layer assignment. "D" (default, visible in print) or "C"
   *  (hidden in print by default). */
  layerKey?: "D" | "C";
  /** Optional colour override. When undefined, layer colour is used. */
  color?: string;
  /** Phase 6.8.2 — optional geo anchor for map-tracking.
   *  Stamped at create time when the map is visible so the
   *  annotation tracks the leaflet map view on pan / zoom (same
   *  contract as `SchemeNode.geo`). The `x` / `y` pixel coords
   *  remain the source of truth and the canvas-only fallback; the
   *  `geo` field is the map-tracking overlay. Codebase convention:
   *  `lon`, not `lng`. */
  geo?: { lat: number; lon: number };
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
  /** Phase 6.6.1 — kind union extended with "dimension".
   *  Phase 6.6.2 — extended again with "constructionLine".
   *  Phase 6.6.3 — extended again with "annotation".
   *  Phase 6.7.3 — extended with singleton "northArrow" (no
   *    multiSelection list — there is only one north arrow per
   *    project).
   *  Phase 6.8.6 — extended with "building" (reference outline
   *    polygons). */
  selection: {
    kind:
      | "node"
      | "pipe"
      | "dimension"
      | "constructionLine"
      | "annotation"
      | "northArrow"
      | "building";
    id: string;
  } | null;
  multiSelection: {
    nodeIds: string[];
    pipeIds: string[];
    dimensionIds?: string[];
    /** Phase 6.6.2 — construction-line selection set. */
    constructionLineIds?: string[];
    /** Phase 6.6.3 — annotation selection set. */
    annotationIds?: string[];
    /** Phase 6.8.6 — building selection set. */
    buildingIds?: string[];
  };
  /** Phase 6.6.1 — dimensions snapshot for batched op undo. */
  dimensions?: SchemeDimension[];
  /** Phase 6.6.2 — construction-lines snapshot for batched op undo. */
  constructionLines?: SchemeConstructionLine[];
  /** Phase 6.6.3 — annotations snapshot for batched op undo. */
  annotations?: SchemeAnnotation[];
  /** Phase 6.8.6 — reference buildings snapshot for batched op undo. */
  buildings?: SchemeBuilding[];
  /** Phase 12.5 — composite-channel snapshot for batched op undo.
   *  Optional so pre-12.5 snapshots that somehow leaked into a project
   *  rollback don't lose existing channels (they stay untouched). */
  channels?: SchemeChannel[];
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
  /** Phase 6.6.2 — construction-line entities. Optional so legacy
   *  projects without drafting aids load cleanly. */
  constructionLines?: SchemeConstructionLine[];
  /** Phase 6.6.3 — text annotation entities. Optional so legacy
   *  projects without drafting aids load cleanly. */
  annotations?: SchemeAnnotation[];
  /** Phase 6.8.6 — reference building entities (polygon outlines
   *  drawn on the canvas / map). Optional so legacy projects
   *  load cleanly. */
  buildings?: SchemeBuilding[];
  /** Phase 12.5 — composite pipe channels (Л-4 / Л-7 / Л-9 per
   *  ГК-23/02 СЕРИЯ Г-991-1). Each channel groups 1-5 SchemePipe
   *  entities sharing geometry. Additive — Phase 6/7/8 projects
   *  without channels load cleanly. */
  channels?: SchemeChannel[];
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
