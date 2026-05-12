/**
 * Phase 6.6.2 — Construction line helpers (pure functions).
 *
 * Math + hit-test; rendering happens in SchemeEditor. Store
 * mutations live in `./constructionLineApplier.ts` (applier pattern
 * from Phase 6.5 — no new StoreActions added).
 *
 * Pieces:
 *   - constructionLineLength(line): Euclidean px-to-metre length in
 *     scheme space. Construction lines are free-coord (no node
 *     anchor, no Haversine path) so we have a single conversion to
 *     do. Used by InspectorPanel for the length readout.
 *   - constructionLineBoundingBox(line): for rubber-band hit testing.
 *   - distanceFromPointToSegment(p, a, b): generic geometry helper
 *     used for click hit-testing the construction line itself
 *     (since the rendered stroke is thin, we widen the hit zone via
 *     a perpendicular-distance threshold).
 *   - constructionLineMidpoint(line): label anchor / arrow midpoints.
 *
 * Style → stroke-dasharray mapping is centralised here so renderer
 * and exporter (future PDF/DXF) share one source of truth.
 */

import type { SchemeConstructionLine } from "../hydraulicTypes";
import { pxToM } from "../nodeCatalog";

/** Map the engineer-facing line style to an SVG stroke-dasharray.
 *  Dashed = drafting convention default. */
export function strokeDasharrayForStyle(
  style: SchemeConstructionLine["style"] | undefined,
): string | undefined {
  switch (style) {
    case "solid":
      return undefined; // no dashes
    case "dotted":
      return "1 3";
    case "dashed":
    default:
      return "6 4";
  }
}

/** Euclidean length of the construction line in metres. */
export function constructionLineLength(line: SchemeConstructionLine): number {
  const dx = line.to.x - line.from.x;
  const dy = line.to.y - line.from.y;
  const dist_px = Math.sqrt(dx * dx + dy * dy);
  return pxToM(dist_px);
}

/** Midpoint of the construction line — used to anchor the label. */
export function constructionLineMidpoint(
  line: SchemeConstructionLine,
): { x: number; y: number } {
  return {
    x: (line.from.x + line.to.x) / 2,
    y: (line.from.y + line.to.y) / 2,
  };
}

/** Axis-aligned bounding box. Used by the rubber-band hit test in
 *  SchemeEditor + by future export-frame logic. */
export function constructionLineBoundingBox(
  line: SchemeConstructionLine,
): { minX: number; minY: number; maxX: number; maxY: number } {
  return {
    minX: Math.min(line.from.x, line.to.x),
    minY: Math.min(line.from.y, line.to.y),
    maxX: Math.max(line.from.x, line.to.x),
    maxY: Math.max(line.from.y, line.to.y),
  };
}

/**
 * Perpendicular distance from a point `p` to the line segment `a-b`.
 *
 * Used for the click hit-test. The drawn stroke is 1.5 px wide so a
 * literal pointer-events="visibleStroke" would force a frustratingly
 * precise click; we widen the hit zone to ~6 px by checking the
 * perpendicular distance against a threshold in the caller.
 *
 * Degenerate (a == b) case returns the plain Euclidean distance.
 */
export function distanceFromPointToSegment(
  p: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-9) {
    const ddx = p.x - a.x;
    const ddy = p.y - a.y;
    return Math.sqrt(ddx * ddx + ddy * ddy);
  }
  // Project p onto a→b, clamped to [0,1].
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  const projX = a.x + t * dx;
  const projY = a.y + t * dy;
  const ddx = p.x - projX;
  const ddy = p.y - projY;
  return Math.sqrt(ddx * ddx + ddy * ddy);
}

/** Convenience: is the point within `tolerance_px` of the line's
 *  drawn body? Used by SchemeEditor's click hit-test before falling
 *  back to standard SVG event flow. */
export function isPointNearConstructionLine(
  p: { x: number; y: number },
  line: SchemeConstructionLine,
  tolerance_px: number,
): boolean {
  return distanceFromPointToSegment(p, line.from, line.to) <= tolerance_px;
}
