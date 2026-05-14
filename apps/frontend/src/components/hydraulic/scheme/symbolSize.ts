/**
 * Phase 6A — hybrid clamping symbol scaling.
 *
 * Problem we solve:
 *   Hydraulic schema symbols (УДДТ, АОС, ДХ, ҮХТ, etc.) used a
 *   hardcoded pixel radius (~12 px) regardless of map zoom level.
 *   At zoom 18 a single house symbol was a 4-pixel-on-the-roof dot;
 *   at zoom 12 the same 12 px disk covered three blocks. Neither
 *   matches the engineering intuition the user is drawing on.
 *
 * Strategy — hybrid clamping (the Google Maps marker model):
 *   1. Each entity kind has a real-world reference size in metres
 *      (e.g. УДДТ ≈ 12 m, АОС ≈ 8 m, fixed support ≈ 0.5 m).
 *   2. Convert to pixels using the current map's px-per-metre.
 *   3. Clamp to [MIN_SYMBOL_PX, MAX_SYMBOL_PX] so:
 *        - far zoom-out: symbols still visible (no sub-pixel dots)
 *        - far zoom-in:  symbols don't bloat to fill the screen.
 *
 * The function is intentionally pure — given (kind, mapPxPerMeter),
 * the output is deterministic and trivially testable. Subscribing
 * to Leaflet's `zoomend` is done by the consumer (SchemeEditor) so
 * this module stays renderer-free.
 *
 * Pipe stroke widths get the same treatment but with much tighter
 * bounds so they don't ever wash out (1 px floor) or look like
 * highways (4 px ceiling).
 */

import type { NodeCategory } from "../nodeCatalog";

/**
 * Real-world reference size in metres for each entity type. This is
 * what gets multiplied by px-per-metre and then clamped.
 *
 * Phase 6.8.3 calibration (engineer feedback "ЦТП хэт том"):
 *   Previous values (source 12m, consumer 8m) bumped into MIN_SYMBOL_PX
 *   at every common engineering zoom (14–17 on UB scale), so all
 *   symbols rendered at the same 24-px diameter — too big next to an
 *   actual 5-storey apartment footprint on OSM.
 *
 *   New baseline matches Mongolian residential project paperwork at
 *   true scale (ГК-23/02 АОС-1...5 measure ~30–40 m on the building
 *   plan, УДДТ / ЦТП cabin is 15–20 m at street level). MIN/MAX clamps
 *   relax accordingly so at zoom 16 the symbols now sit IN BAND
 *   instead of all clamping to the floor.
 *
 * Junction / fittings stay tiny — they're hydraulic abstractions, not
 * physical objects, so we keep them at sub-metre scale and let
 * MIN_SYMBOL_PX guarantee they stay clickable.
 */
export const ENTITY_REAL_SIZE_M: Record<EntityKind, number> = {
  source: 18,       // ЦТП / УДДТ cabin — typical heat substation 15–20 m
  consumer: 35,     // АОС — typical 5-storey apartment width 30–40 m
  well: 4,          // ИТП chamber / well cover
  fixedSupport: 0.5,
  elbow: 0.4,
  compensator: 1.5,
  valve: 0.4,
  junction: 0.3,
  pump: 1.5,
};

/** The 9 logical "entity kinds" that get a real-world size. Maps onto
 *  the existing nodeCatalog NodeCategory + a few specific node kinds. */
export type EntityKind =
  | "source"
  | "consumer"
  | "well"
  | "fixedSupport"
  | "elbow"
  | "compensator"
  | "valve"
  | "junction"
  | "pump";

/** Clamping bounds in SVG pixels (Leaflet container pixels).
 *
 *  Phase 6.8.3 calibration: floor dropped 12 → 6 so an АОС at zoom 16
 *  (where 35 m × 0.626 px/m / 2 ≈ 11 px) lands IN BAND rather than
 *  clamping to the old 12 px floor and looking the same size as a
 *  junction marker. Ceiling dropped 80 → 60 to keep close-zoom
 *  symbols from dominating the OSM building footprints they sit on. */
export const MIN_SYMBOL_PX = 6;
export const MAX_SYMBOL_PX = 60;

/** Stroke-width clamping for pipes (narrower band — pipes go from
 *  thin lines at far zoom-out to "highways" if not capped). */
export const MIN_PIPE_PX = 1;
export const MAX_PIPE_PX = 4;

/** Pipe reference stroke in metres — typical DN50 is 0.06 m OD;
 *  we exaggerate slightly so pipes register visually at street zoom.
 *  The bigger DN's get scaled relative to this baseline. */
export const PIPE_REFERENCE_DIAMETER_MM = 100;

/**
 * Map a node's `kind` or `category` to an EntityKind. The function
 * accepts both because `nodeCatalog` carries fine-grained kinds
 * ("fixed_support_steel", "compensator_axial", "junction_T") while
 * the legacy code-paths often only know the category.
 *
 * Resolution order:
 *   1. Exact kind match (handles fine-grained Politerm-derived kinds).
 *   2. Category match (catch-all for new kinds we haven't enumerated).
 *   3. Fallback: "junction" (smallest, always visible).
 */
export function resolveEntityKind(
  kind: string | undefined,
  category?: NodeCategory,
): EntityKind {
  if (kind) {
    if (kind === "source" || kind.startsWith("source_")) return "source";
    if (kind === "consumer" || kind.startsWith("consumer_")) return "consumer";
    if (kind === "well" || kind.startsWith("well_") || kind === "chamber") return "well";
    if (kind.startsWith("fixed_support")) return "fixedSupport";
    if (kind.startsWith("elbow")) return "elbow";
    if (kind.startsWith("compensator")) return "compensator";
    if (kind === "valve" || kind.startsWith("valve_")) return "valve";
    if (kind === "pump" || kind.startsWith("pump_")) return "pump";
    if (kind === "junction" || kind.startsWith("junction_")) return "junction";
  }
  if (category) {
    switch (category) {
      case "source": return "source";
      case "consumer": return "consumer";
      case "valve": return "valve";
      case "pump": return "pump";
      // Phase 8.5 — sensors render at junction size (small marker).
      // eslint-disable-next-line no-fallthrough
      case "fitting":
      case "chamber":
      case "sensor":
        return "junction";
    }
  }
  return "junction";
}

/**
 * Phase 6.8.3 — symbol-size preset multipliers.
 *
 * Engineers who want a bird's-eye schematic view dial down to Small
 * so site-level overviews stay legible; engineers working on a
 * dense apartment-cluster diagram dial up to Large so the same set
 * of symbols dominates the cluttered map background. The multipliers
 * are applied AT the final radius (so MIN/MAX clamps still bracket
 * the result and the smallest entities can't disappear).
 */
export type SymbolSizePreset = "small" | "medium" | "large";
export const SYMBOL_SIZE_PRESETS: Record<SymbolSizePreset, number> = {
  small: 0.7,
  medium: 1.0,
  large: 1.3,
};
/** Default when ProjectSettings.symbolSizePreset is unset (legacy projects). */
export const DEFAULT_SYMBOL_SIZE_PRESET: SymbolSizePreset = "medium";

/**
 * Compute the visible symbol radius in SVG pixels for a given entity
 * type at the current map zoom (expressed as pixels per metre).
 *
 * @param entity            Entity kind (use `resolveEntityKind` if
 *                          you only have a SchemeNode.kind string).
 * @param pxPerMeter        Pixels per metre at the current Leaflet
 *                          zoom. Pass `null` / `0` to fall back to
 *                          MIN_SYMBOL_PX (used when the map isn't
 *                          visible — schematic mode keeps a fixed
 *                          legible size).
 * @param scaleMultiplier   Phase 6.8.3 — composite factor that the
 *                          caller derives from
 *                          `SYMBOL_SIZE_PRESETS[settings.symbolSizePreset]
 *                          × (node.size_scale ?? 1.0)`. Defaults to 1.0
 *                          for legacy callers. Applied multiplicatively
 *                          to the un-clamped radius BEFORE the MIN/MAX
 *                          clamp so a "Small" preset can still bring
 *                          a tiny junction marker below the floor
 *                          (clamps step in) and a "Large" preset can
 *                          push a source past the cap (clamps cap it).
 * @returns                 Symbol radius (half-width) in pixels,
 *                          clamped.
 */
export function computeSymbolRadiusPx(
  entity: EntityKind,
  pxPerMeter: number | null,
  scaleMultiplier: number = 1.0,
): number {
  if (!pxPerMeter || pxPerMeter <= 0) {
    // Schematic-mode floor still respects the multiplier so a Small
    // preset on a schematic-only project visibly shrinks every symbol
    // (rather than ignoring the engineer's setting).
    return clamp(MIN_SYMBOL_PX * scaleMultiplier, MIN_SYMBOL_PX * 0.5, MAX_SYMBOL_PX);
  }
  const real_m = ENTITY_REAL_SIZE_M[entity];
  // Reference SIZE is a diameter, so divide by 2 for radius.
  const radius_px = ((real_m * pxPerMeter) / 2) * scaleMultiplier;
  return clamp(radius_px, MIN_SYMBOL_PX, MAX_SYMBOL_PX);
}

/**
 * Compute the visible pipe stroke width in SVG pixels for a given
 * DN at the current map zoom.
 *
 * The stroke width grows with DN (so a DN200 magistral looks visibly
 * thicker than a DN32 service) but tighter clamps apply so even a
 * DN500 trunk doesn't dominate the canvas, and a DN15 line never
 * disappears.
 *
 * @param dn_mm       Nominal pipe diameter (mm).
 * @param pxPerMeter  Pixels per metre at the current zoom. Null /
 *                    zero falls back to 1.5 px (legible schematic
 *                    line weight).
 */
export function computePipeStrokeWidthPx(
  dn_mm: number,
  pxPerMeter: number | null,
): number {
  if (!pxPerMeter || pxPerMeter <= 0) return 1.5;
  // Scale: pipe OD (m) × pxPerMeter, then take 1/3 so DN100 ≈ 3 px at
  // street zoom (px/m ≈ 1) rather than 100 px. The reference is just
  // a feel-good multiplier — we clamp aggressively anyway.
  const od_m = dn_mm / 1000;
  const raw_px = od_m * pxPerMeter * 0.5;
  return clamp(raw_px, MIN_PIPE_PX, MAX_PIPE_PX);
}

/**
 * Convenience: derive px-per-metre from Leaflet's zoom level.
 *
 * At Leaflet's default web-mercator tiling, 1° latitude at the
 * equator is 256 × 2^zoom / 360 ≈ pixels. Translating to metres
 * (using EARTH_RADIUS_M = 6 371 000):
 *
 *   pxPerMeter ≈ 256 × 2^zoom / (2π · R · cos(lat))
 *
 * This is the same formula `latLngToContainerPoint` uses internally;
 * we replicate it here so this module has no Leaflet dependency
 * (keeps it testable without a DOM).
 *
 * @param zoom       Leaflet zoom level (typically 10–22).
 * @param lat_deg    Latitude in degrees. Defaults to 47.92 (УБ centre
 *                   — close enough for any Mongolian project; the
 *                   cosine factor barely changes across the country).
 */
export function pxPerMeterAtZoom(zoom: number, lat_deg: number = 47.92): number {
  const EARTH_R_M = 6_371_000;
  const tileSize = 256; // Leaflet/Mapbox standard
  const latRad = (lat_deg * Math.PI) / 180;
  const worldPx = tileSize * Math.pow(2, zoom);
  const earthCircumferenceAtLat_m = 2 * Math.PI * EARTH_R_M * Math.cos(latRad);
  return worldPx / earthCircumferenceAtLat_m;
}

/** Clamp a number to a closed range. */
function clamp(v: number, lo: number, hi: number): number {
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}
