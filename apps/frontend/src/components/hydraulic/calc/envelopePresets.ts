/**
 * Phase 13.42 — Envelope presets for the heat-load calc.
 *
 * Engineer report (Mongolian transliteration): "Jisheelber OS 04 deer
 * darah ued dulaani ahaallin tootsoo hiih heseg garah yostoi
 * Ezelhuuneer tootsoh eswel hashih hiitsiin tootsoo hiih songolttoi
 * baih yostoi olon dawhar barilga shilen barilga 1 dawhar geed
 * barilga tus buriin ontslogoos shaltgaalnaaad."
 *
 * Translation: "When clicking on OS-04 (Орон сууц-04), a heat-load
 * calculation section should appear. There should be a choice
 * between Volumetric calc OR Envelope (cladding/skin) calc, based on
 * each building's specifics — multi-storey, glass curtain wall,
 * single-storey, etc."
 *
 * The envelope-based path (`calc/heatLoad.ts`) needs surfaces, areas,
 * U-values, ACH, etc. — a lot for the engineer to fill manually. This
 * module returns ready-to-use `BuildingEnvelope` objects for the three
 * common Mongolian building archetypes:
 *
 *   1. multiStory_apartment  — 5+ storey panel/brick АОС
 *   2. glassCurtain_office   — large glass-skin office (cold bridges
 *                              + high U-value glass dominate Q_loss)
 *   3. singleStory_house     — 1-storey private house (Surface/V
 *                              ratio is high, roof+floor dominate)
 *
 * Engineer can override each surface afterwards via the EnvelopeEditor.
 *
 * Standard: БНбД 23-02-09 (Барилгын дулаан хамгаалалт) — Mongolian
 * thermal protection code. Climate defaults to Улаанбаатар (the most
 * common project location); engineer can switch via the city dropdown.
 *
 * Pure module — no React, no DOM. Returns plain data.
 */
import type { BuildingEnvelope, EnvelopeSurface } from "../hydraulicTypes";

/** Tag used in `node.heatLoadMethod` to pick the calc method. */
export type HeatLoadMethod = "volumetric" | "envelope" | "manual";

/** Engineer-facing label for the preset (Mongolian). */
export interface EnvelopePreset {
  key: "multiStory_apartment" | "glassCurtain_office" | "singleStory_house";
  /** Short Mongolian label shown on the preset button. */
  label: string;
  /** One-line description shown on hover / under the button. */
  description: string;
  /** Default emoji glyph for the button. */
  icon: string;
  /** Build the BuildingEnvelope for a project at this city. */
  build(opts: { city?: string; floor_area_m2?: number }): BuildingEnvelope;
}

/** Stable seed for generating EnvelopeSurface ids. The Inspector
 *  later regenerates ids when the engineer adds/removes surfaces. */
function sid(preset: string, idx: number): string {
  return `${preset}_s${idx}`;
}

/**
 * 🏢 Олон давхар орон сууц — typical 5-9 storey Soviet-era panel /
 * post-1995 brick apartment block in Mongolia.
 *
 * Defaults:
 *   - Floor area: 500 m² (e.g. 5 stories × 100 m²/storey)
 *   - Walls: `panel_160` (Хавтгай панел барилга 160 мм, U=1.39)
 *     — represents the dominant Mongolian apartment construction.
 *   - Windows: ~18 % WWR, `pvc_2pane` (U=2.3) — typical post-2010
 *     retrofit. 4 wall directions covered with a single combined
 *     wall surface + a single combined window surface (engineer
 *     splits per orientation manually if needed for §6 β
 *     corrections).
 *   - Roof: `roof_standard` (U=0.31)
 *   - Floor (ground): `floor_ground` (U=0.4)
 *   - Use: residential → ACH 1.0, T_indoor 20 °C, gains 10 W/m²
 *   - Volume: floor area × 2.8 m (default Inspector behaviour)
 */
function buildMultiStoryApartment(opts: {
  city?: string;
  floor_area_m2?: number;
}): BuildingEnvelope {
  const A_floor = opts.floor_area_m2 ?? 500;
  // 5 storeys × 100 m² each → 5×~40 m² of wall per storey ≈ 200 m².
  // Aggregate all walls into one surface for simplicity.
  const wallArea = Math.max(200, Math.round(A_floor * 0.4));
  // ~18 % WWR of wall area.
  const windowArea = Math.round(wallArea * 0.18);
  // Roof = top-floor footprint.
  const roofArea = Math.round(A_floor / 5);
  const floorGroundArea = roofArea; // identical footprint
  const surfaces: EnvelopeSurface[] = [
    { id: sid("apt", 1), wallTypeKey: "panel_160", area_m2: wallArea, isCorner: true },
    { id: sid("apt", 2), wallTypeKey: "pvc_2pane", area_m2: windowArea },
    { id: sid("apt", 3), wallTypeKey: "roof_standard", area_m2: roofArea },
    { id: sid("apt", 4), wallTypeKey: "floor_ground", area_m2: floorGroundArea },
  ];
  return {
    floor_area_m2: A_floor,
    city: opts.city ?? "Улаанбаатар",
    use: "residential",
    surfaces,
    volume_m3: Math.round(A_floor * 2.8),
  };
}

/**
 * 🏬 Шилэн барилга / Glass curtain-wall office — modern UB office /
 * shopping centre with a high WWR (50-70 %) and aluminium / steel
 * frame curtain wall.
 *
 * Defaults:
 *   - Floor area: 800 m² (e.g. 4 storeys × 200 m²/storey)
 *   - Walls: `sandwich_100` (U=0.45) — the opaque spandrel panel
 *     between glass bands.
 *   - Windows / curtain wall: `pvc_2pane` (U=2.3) — represents the
 *     typical IGU on a curtain wall. Engineer switches to
 *     `pvc_3pane_lowe` (U=1.4) if the curtain wall is high-spec.
 *   - 60 % WWR of vertical envelope.
 *   - Roof: `roof_standard`
 *   - Floor: `floor_ground`
 *   - Use: office → ACH 1.5, T_indoor 18 °C, gains 25 W/m²
 *   - Volume: 4 storeys × 3.5 m = 14 m ceiling × floor area
 *     (curtain-wall offices typically have ~3.5 m floor heights)
 */
function buildGlassCurtainOffice(opts: {
  city?: string;
  floor_area_m2?: number;
}): BuildingEnvelope {
  const A_floor = opts.floor_area_m2 ?? 800;
  // Per-storey perimeter ≈ sqrt(A/4) × 4. Total wall area = perimeter
  // × storey height × n_storeys, but we collapse into ratios.
  const totalVerticalEnvelope = Math.max(400, Math.round(A_floor * 0.7));
  const windowArea = Math.round(totalVerticalEnvelope * 0.6); // 60 % WWR
  const wallArea = totalVerticalEnvelope - windowArea;
  const roofArea = Math.round(A_floor / 4);
  const floorGroundArea = roofArea;
  const surfaces: EnvelopeSurface[] = [
    { id: sid("glass", 1), wallTypeKey: "sandwich_100", area_m2: wallArea, isCorner: true },
    { id: sid("glass", 2), wallTypeKey: "pvc_2pane", area_m2: windowArea },
    { id: sid("glass", 3), wallTypeKey: "roof_standard", area_m2: roofArea },
    { id: sid("glass", 4), wallTypeKey: "floor_ground", area_m2: floorGroundArea },
  ];
  return {
    floor_area_m2: A_floor,
    city: opts.city ?? "Улаанбаатар",
    use: "office",
    surfaces,
    volume_m3: Math.round(A_floor * 3.5),
  };
}

/**
 * 🏠 1 давхар хувийн байшин — single-storey private house. High
 * surface/volume ratio so roof + floor dominate Q_loss; walls per
 * unit area get a higher % of the budget than in a multi-storey
 * block.
 *
 * Defaults:
 *   - Floor area: 80 m² (typical Mongolian gerteg площадь)
 *   - Walls: `aac_300` (Хөнгөн блок 300 мм, U=0.54) — the post-2015
 *     standard for new private houses.
 *   - Windows: 15 % WWR, `pvc_2pane`
 *   - Roof: `attic` (Оройн хучилт, U=0.24) — most private houses
 *     have a vented attic above the living space.
 *   - Floor: `floor_ground`
 *   - Use: residential → ACH 1.0, T_indoor 20 °C
 *   - Volume: floor area × 2.8 m
 */
function buildSingleStoryHouse(opts: {
  city?: string;
  floor_area_m2?: number;
}): BuildingEnvelope {
  const A_floor = opts.floor_area_m2 ?? 80;
  // For a square footprint, perimeter = 4 × sqrt(A). Wall area =
  // perimeter × 2.8 m (single storey height).
  const perimeter = 4 * Math.sqrt(A_floor);
  const totalVerticalEnvelope = Math.round(perimeter * 2.8);
  const windowArea = Math.round(totalVerticalEnvelope * 0.15); // 15 % WWR
  const wallArea = totalVerticalEnvelope - windowArea;
  const surfaces: EnvelopeSurface[] = [
    { id: sid("house", 1), wallTypeKey: "aac_300", area_m2: wallArea, isCorner: true },
    { id: sid("house", 2), wallTypeKey: "pvc_2pane", area_m2: windowArea },
    { id: sid("house", 3), wallTypeKey: "attic", area_m2: A_floor },
    { id: sid("house", 4), wallTypeKey: "floor_ground", area_m2: A_floor },
  ];
  return {
    floor_area_m2: A_floor,
    city: opts.city ?? "Улаанбаатар",
    use: "residential",
    surfaces,
    volume_m3: Math.round(A_floor * 2.8),
  };
}

/**
 * Public registry — three presets the Inspector renders as buttons.
 * Order matters: shown left-to-right on the panel. New presets append.
 */
export const ENVELOPE_PRESETS: ReadonlyArray<EnvelopePreset> = [
  {
    key: "multiStory_apartment",
    label: "Олон давхар",
    description: "5-9 давхар орон сууц / панел",
    icon: "🏢",
    build: buildMultiStoryApartment,
  },
  {
    key: "glassCurtain_office",
    label: "Шилэн",
    description: "Шилэн фасад оффис / худалдааны төв",
    icon: "🏬",
    build: buildGlassCurtainOffice,
  },
  {
    key: "singleStory_house",
    label: "1 давхар",
    description: "1 давхар хувийн байшин",
    icon: "🏠",
    build: buildSingleStoryHouse,
  },
];

/** Lookup by key (e.g. from a saved project). Returns undefined if
 *  the key isn't a registered preset. */
export function getEnvelopePreset(key: string): EnvelopePreset | undefined {
  return ENVELOPE_PRESETS.find((p) => p.key === key);
}
