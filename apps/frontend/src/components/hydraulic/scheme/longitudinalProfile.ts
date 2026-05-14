/**
 * Phase 8.1 — Longitudinal profile (pure helpers).
 *
 * Computes a chainage-vs-elevation trace from the source node to the
 * worst-served (longest cumulative path) consumer. This is the
 * "профиль" sheet in a Mongolian district-heating drawing set: a
 * stretched-out side view of the magistral line with terrain +
 * pipe centerline + node markers.
 *
 * Standard references:
 *   - СП 124.13330.2012 §7.4 — magistral line = longest cumulative
 *     length from the source, also drives pump head sizing.
 *   - БНбД 41-01-2019 §6.3   — consumer ΔP ≥ 0.15 MPa applied to the
 *     farthest consumer (same path the profile renders).
 *   - ГОСТ 21.605            — chainage labelling: km+m format
 *     "0+000", "0+050", … "1+250".
 *
 * Pure functions only — no DOM, no Leaflet, no React. Unit-tested
 * directly with synthetic fixtures (see
 * scheme/__tests__/longitudinalProfile.test.ts).
 *
 * Implementation note: re-uses `pickAutoSource` + `findLongestPath`
 * from calc/topology so the path picked here matches the one
 * piezometric / pump-sizing already report on. Engineers see the
 * same "worst-served consumer" everywhere — one source of truth.
 */
import type { SchemeNode, SchemePipe } from "../hydraulicTypes";
import { findLongestPath, pickAutoSource } from "../calc/topology";

/**
 * Single sample along the chainage axis — one per node on the path.
 *
 * `elevation_m` defaults to `0` when the underlying node didn't carry
 * `elevation_m`. The view caller can decide whether to render
 * undefined-elevation segments as a dashed warning track or a flat
 * "assumed-0" line; the helper just exposes the raw + fallback so
 * the choice stays at the UI layer.
 */
export interface ProfilePoint {
  /** Node id (matches SchemeNode.id). */
  nodeId: string;
  /** Cumulative distance along the path from the source (m). */
  chainage_m: number;
  /** Elevation in metres at this node. Defaults to 0 when the node
   *  didn't carry elevation_m — see hasElevation for the truth. */
  elevation_m: number;
  /** Whether the underlying node carried an explicit elevation_m.
   *  When false, `elevation_m` is the 0-fallback. */
  hasElevation: boolean;
  /** Engineer-facing label (matches SchemeNode.label). */
  label: string;
  /** Node kind (for marker styling — source / consumer / chamber / …). */
  kind: string;
  /** Pipe DN at the ENTRY edge of this node along the path. Source
   *  node has `undefined` because no pipe arrives at chainage 0. */
  entryDn_mm?: number;
  /** Pipe burial depth metres at the ENTRY edge of this node along
   *  the path. Optional — only populated when the entry pipe carried
   *  `burialDepth_m`. Used by the view to draw a faint pipe-
   *  centerline track below the ground line. */
  entryBurialDepth_m?: number;
}

/** Successful trace output. */
export interface ProfileTrace {
  /** Source node id at chainage 0. */
  sourceId: string;
  /** Last node id at the longest cumulative chainage. */
  terminalId: string;
  /** Cumulative path length (m). Sum of entry segment lengths. */
  totalLength_m: number;
  /** Highest elevation on the path (m). */
  maxElevation_m: number;
  /** Lowest elevation on the path (m). */
  minElevation_m: number;
  /** Whether ANY node on the path carried an explicit elevation. When
   *  false the entire trace is at the 0-fallback and the view should
   *  show a "no elevation data" advisory. */
  anyElevation: boolean;
  /** Samples sorted ascending by chainage. First is source @ 0. */
  points: ProfilePoint[];
}

/** Failure result — engineer-facing reason string. */
export interface ProfileError {
  error: string;
}

/**
 * Decide whether to render the profile or surface an error. Pure;
 * deterministic given the same inputs.
 *
 * Engineer-friendly error strings explain why a profile can't be
 * derived ("no source", "no pipes", etc) so the view layer can
 * render them verbatim.
 */
export function buildLongitudinalProfile(
  nodes: SchemeNode[],
  pipes: SchemePipe[],
): ProfileTrace | ProfileError {
  if (nodes.length === 0) {
    return { error: "Сүлжээнд зангилаа байхгүй байна." };
  }
  if (pipes.length === 0) {
    return { error: "Сүлжээнд хоолой байхгүй байна. Хоолой зурахаас өмнө профиль гаргах боломжгүй." };
  }
  const source = pickAutoSource(nodes);
  if (!source) {
    return { error: "Сүлжээнд эх үүсвэр (ТЭЦ / Котельная / ЦТП / Геотермал) олдсонгүй." };
  }
  const longest = findLongestPath(nodes, pipes, source.id);
  if (!longest || longest.nodeIds.length < 2) {
    return { error: "Эх үүсвэрээс хүрэх хэрэглэгчрүү шугам байхгүй байна." };
  }

  // Walk the path, sampling chainage at each node. Source is at
  // chainage 0; every subsequent node sits at the cumulative sum of
  // entering segment lengths.
  const points: ProfilePoint[] = [];
  let chainage = 0;
  for (let i = 0; i < longest.nodeIds.length; i += 1) {
    const nodeId = longest.nodeIds[i]!;
    const n = nodes.find((x) => x.id === nodeId);
    if (!n) continue;
    let entryDn_mm: number | undefined;
    let entryBurialDepth_m: number | undefined;
    if (i > 0) {
      const seg = longest.pipes[i - 1]!;
      chainage += seg.pipe.length_m;
      entryDn_mm = seg.pipe.dn;
      entryBurialDepth_m = seg.pipe.burialDepth_m;
    }
    const hasElev = typeof n.elevation_m === "number";
    points.push({
      nodeId: n.id,
      chainage_m: chainage,
      elevation_m: hasElev ? n.elevation_m! : 0,
      hasElevation: hasElev,
      label: n.label,
      kind: n.kind,
      ...(typeof entryDn_mm === "number" ? { entryDn_mm } : {}),
      ...(typeof entryBurialDepth_m === "number" ? { entryBurialDepth_m } : {}),
    });
  }

  const elevs = points.map((p) => p.elevation_m);
  const anyElevation = points.some((p) => p.hasElevation);

  return {
    sourceId: source.id,
    terminalId: points[points.length - 1]!.nodeId,
    totalLength_m: chainage,
    maxElevation_m: Math.max(...elevs),
    minElevation_m: Math.min(...elevs),
    anyElevation,
    points,
  };
}

/* ─── Chainage label formatting ────────────────────────────────── */

/**
 * Format a chainage in metres as `km+m` (the standard ГОСТ 21.605
 * convention used by Mongolian engineers for road / pipe / rail
 * drawings).
 *
 * Examples:
 *   - 0      → "0+000"
 *   - 50     → "0+050"
 *   - 1250   → "1+250"
 *   - 12500  → "12+500"
 *
 * Negative chainage (shouldn't occur for a valid profile but kept
 * defensive) returns "(-N)+000".
 */
export function formatChainage(meters: number): string {
  const safe = Math.round(meters);
  if (safe < 0) {
    return `${safe}+000`;
  }
  const km = Math.floor(safe / 1000);
  const m = safe - km * 1000;
  return `${km}+${m.toString().padStart(3, "0")}`;
}

/* ─── Tick generation ──────────────────────────────────────────── */

/**
 * Pick a chainage tick step that yields 6-12 ticks across the path.
 * Engineers expect labels every 50/100/250/500/1000 m depending on
 * the path length. Returns the step in metres.
 *
 * Bias toward ROUND ENGINEERING NUMBERS rather than mathematically
 * optimal — engineers can scan "0+000, 0+250, 0+500" faster than
 * "0+000, 0+212, 0+424".
 */
export function pickChainageTickStep(totalLength_m: number): number {
  // Engineering-round breakpoints.
  if (totalLength_m <= 250) return 25;
  if (totalLength_m <= 500) return 50;
  if (totalLength_m <= 1000) return 100;
  if (totalLength_m <= 2500) return 250;
  if (totalLength_m <= 5000) return 500;
  if (totalLength_m <= 10000) return 1000;
  return 2000;
}

/**
 * Pick an elevation tick step (m) for the Y axis. Mongolian
 * residential plans typically span 5-30 m elevation; trunk
 * district networks 30-200 m.
 */
export function pickElevationTickStep(rangeM: number): number {
  if (rangeM <= 5) return 0.5;
  if (rangeM <= 10) return 1;
  if (rangeM <= 25) return 2;
  if (rangeM <= 50) return 5;
  if (rangeM <= 100) return 10;
  return 20;
}
