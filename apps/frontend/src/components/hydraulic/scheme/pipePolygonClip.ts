/**
 * Phase 13.1 — Pipe endpoint clipping at building polygon perimeter.
 *
 * When a pipe's `from` or `to` node is tagged to a SchemeBuilding
 * (Phase 12.1/12.4 outline workflow), engineers expect the pipe to
 * terminate at the building EDGE — not at the polygon centroid where
 * the SchemeNode actually sits. AutoCAD convention: pipes "enter" a
 * building through its wall, not through its geometric centre.
 *
 * This module exposes pure geometry helpers:
 *   - polygonSegmentIntersection(seg, polygon) → first hit (or null)
 *   - clipPipeEndpointAtBuilding(args) → adjusted endpoint
 *
 * No DOM, no React. Tested via plain unit tests with synthetic
 * polygons + segments.
 */
import type { SchemeBuilding } from "../hydraulicTypes";

export interface Point2D {
  x: number;
  y: number;
}

/**
 * Find the intersection point between line segment AB and polygon P.
 * Returns the intersection CLOSEST to A (so a segment crossing the
 * polygon twice clips at the entry side, not the far wall).
 *
 * Algorithm: walk every polygon edge, intersect with AB, track the
 * smallest `t ∈ [0,1]` along AB. Numerically stable for axis-aligned
 * + diagonal edges. Returns null when AB does not cross any edge.
 *
 * Math: parametric line intersection
 *   P = A + t·(B−A)  for t ∈ [0,1]
 *   P = C + u·(D−C)  for u ∈ [0,1]
 *   Solve 2×2 system; reject when det ≈ 0 (parallel).
 */
export function polygonSegmentIntersection(
  a: Point2D,
  b: Point2D,
  polygon: ReadonlyArray<Point2D>,
): Point2D | null {
  if (polygon.length < 3) return null;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) return null;

  let bestT = Number.POSITIVE_INFINITY;
  let best: Point2D | null = null;

  for (let i = 0; i < polygon.length; i += 1) {
    const c = polygon[i]!;
    const d = polygon[(i + 1) % polygon.length]!;
    const cdx = d.x - c.x;
    const cdy = d.y - c.y;
    // Determinant
    const det = dx * cdy - dy * cdx;
    if (Math.abs(det) < 1e-9) continue; // parallel
    const acx = c.x - a.x;
    const acy = c.y - a.y;
    const t = (acx * cdy - acy * cdx) / det;
    const u = (acx * dy - acy * dx) / det;
    // Intersection inside both segments
    if (t < 0 || t > 1) continue;
    if (u < 0 || u > 1) continue;
    if (t < bestT) {
      bestT = t;
      best = { x: a.x + t * dx, y: a.y + t * dy };
    }
  }

  return best;
}

/**
 * Whether point P sits INSIDE the polygon. Even-odd ray-cast along
 * positive X. Returns true for points on the boundary in most cases
 * (acceptable for our clipping use — a centroid that lies exactly on
 * a perimeter edge is degenerate and the engineer can fix it).
 */
export function pointInPolygon(p: Point2D, polygon: ReadonlyArray<Point2D>): boolean {
  if (polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const vi = polygon[i]!;
    const vj = polygon[j]!;
    const intersect =
      vi.y > p.y !== vj.y > p.y &&
      p.x < ((vj.x - vi.x) * (p.y - vi.y)) / (vj.y - vi.y) + vi.x;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Find the tagged-building polygon for a node id. The link is the
 * Phase 12.1 bidirectional reference: building.taggedAsNodeId === node.id.
 * Returns null when no building tags this node (= regular symbol-
 * rendered node, no clipping needed).
 */
export function findTaggedBuilding(
  nodeId: string,
  buildings: ReadonlyArray<SchemeBuilding> | undefined,
): SchemeBuilding | null {
  if (!buildings || buildings.length === 0) return null;
  return buildings.find((b) => b.taggedAsNodeId === nodeId) ?? null;
}

/**
 * Adjust ONE endpoint of a pipe so it terminates at the polygon
 * perimeter instead of inside the polygon. Direction of clipping
 * runs FROM the centroid (`endpointAt`) TOWARD the other endpoint
 * (`otherEndpoint`) — we want the intersection that exits the
 * polygon on the side facing `otherEndpoint`.
 *
 * Returns the clipped point, or `endpointAt` unchanged when:
 *   - No building tags this endpoint
 *   - The polygon has <3 vertices (malformed)
 *   - The line doesn't cross the perimeter (e.g. otherEndpoint also
 *     sits inside the polygon — degenerate; engineer should fix)
 */
export function clipPipeEndpointAtBuilding(args: {
  endpointAt: Point2D;
  otherEndpoint: Point2D;
  building: SchemeBuilding;
  /** Optional override — when the caller has already converted the
   *  building.polygon to display-space coords (e.g. for map-anchored
   *  buildings under pan/zoom), pass that in. */
  displayPolygon?: ReadonlyArray<Point2D>;
}): Point2D {
  const polygon =
    args.displayPolygon ??
    args.building.polygon.map((v) => ({ x: v.x, y: v.y }));
  if (polygon.length < 3) return args.endpointAt;
  // Walk the segment from endpointAt toward otherEndpoint and find
  // the FIRST perimeter intersection — that's the "exit point" the
  // pipe should visually terminate at.
  const hit = polygonSegmentIntersection(
    args.endpointAt,
    args.otherEndpoint,
    polygon,
  );
  if (!hit) return args.endpointAt;
  return hit;
}
