/**
 * Phase 12.3 — Pure helpers for SchemePipe.bendPoints + anglePolicy.
 *
 * Pipe data model gained bendPoints (richer than legacy waypoints) +
 * anglePolicy ('free' / 'snap_45' / 'snap_90'). Renderer prefers
 * bendPoints when set; falls back to waypoints for backward compat.
 *
 * Pure functions: no DOM, no React, no store. Just geometry math.
 */
import type { SchemePipe, SchemeNode } from "../hydraulicTypes";

/** Stable point shape — accepted from either bendPoints or waypoints. */
export interface BendPoint {
  x: number;
  y: number;
  lat?: number;
  lon?: number;
}

/**
 * Resolve a pipe's full polyline path including endpoints.
 *
 * Returns an ordered list of points: [fromNode, ...bendPoints, toNode].
 * When bendPoints/waypoints are empty, returns just [from, to]. Used by
 * the renderer to emit an SVG <polyline> through all vertices.
 *
 * Priority: bendPoints (Phase 12.3) > waypoints (Phase 6 legacy).
 * When both are set, bendPoints wins (engineer migrated the pipe).
 */
export function resolvePipePath(
  pipe: SchemePipe,
  from: SchemeNode | null | undefined,
  to: SchemeNode | null | undefined,
): BendPoint[] {
  if (!from || !to) return [];
  const points: BendPoint[] = [{ x: from.x, y: from.y }];
  if (pipe.bendPoints && pipe.bendPoints.length > 0) {
    for (const bp of pipe.bendPoints) points.push({ ...bp });
  } else if (pipe.waypoints && pipe.waypoints.length > 0) {
    for (const wp of pipe.waypoints) points.push({ x: wp.x, y: wp.y });
  }
  points.push({ x: to.x, y: to.y });
  return points;
}

/**
 * Compute the geometric polyline length (sum of segment lengths) in
 * scheme-pixel units. Caller converts to metres via pxToM if needed.
 *
 * NOT used for hydraulics — pipe.length_m remains authoritative.
 * Surfaced in the Inspector as info + drift warning when > 5% off.
 */
export function geometryLengthPx(points: ReadonlyArray<BendPoint>): number {
  if (points.length < 2) return 0;
  let sum = 0;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1]!;
    const b = points[i]!;
    sum += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return sum;
}

/**
 * Check whether the pipe's bend-points-derived geometry length drifts
 * significantly from the authoritative length_m. Threshold: 5%.
 *
 * Engineer sees an Inspector advisory when this returns true so they
 * can sync via "Use geometry length" button (Phase 12.3 UI deferred to
 * the Inspector panel — wire later if needed).
 */
export function hasLengthDrift(
  pipe: SchemePipe,
  from: SchemeNode | null | undefined,
  to: SchemeNode | null | undefined,
  pxPerMeter: number,
  thresholdFraction: number = 0.05,
): boolean {
  if (!from || !to) return false;
  if (pxPerMeter <= 0) return false;
  const points = resolvePipePath(pipe, from, to);
  const geomLen_m = geometryLengthPx(points) / pxPerMeter;
  if (pipe.length_m <= 0) return false;
  const drift = Math.abs(geomLen_m - pipe.length_m) / pipe.length_m;
  return drift > thresholdFraction;
}

/**
 * Snap a target point to the angle-policy constraint relative to an
 * anchor point. Used during pipe drawing to enforce 45° / 90° snap
 * if the engineer chose that policy.
 *
 * For 'free' policy, returns target unchanged. For 'snap_45' /
 * 'snap_90', projects the anchor→target vector onto the nearest
 * snap angle and returns the snapped endpoint at the same magnitude.
 *
 * Shift key bypass (engineer holds Shift during drag) is handled by
 * the caller passing 'snap_45' regardless of pipe.anglePolicy.
 */
export function snapToAnglePolicy(
  anchor: { x: number; y: number },
  target: { x: number; y: number },
  policy: SchemePipe["anglePolicy"],
): { x: number; y: number } {
  if (!policy || policy === "free") return target;
  const dx = target.x - anchor.x;
  const dy = target.y - anchor.y;
  const len = Math.hypot(dx, dy);
  if (len < 0.0001) return target; // degenerate
  const angleRad = Math.atan2(dy, dx);
  const step = policy === "snap_90" ? Math.PI / 2 : Math.PI / 4;
  const snapped = Math.round(angleRad / step) * step;
  return {
    x: anchor.x + Math.cos(snapped) * len,
    y: anchor.y + Math.sin(snapped) * len,
  };
}

/**
 * Find the index where a new bend point should be inserted, given a
 * click position along the pipe. Returns the segment index after
 * which the new point belongs.
 *
 * Algorithm: for each segment in the polyline, compute the
 * perpendicular distance from the click to the segment. The segment
 * with the smallest distance is where the bend point inserts.
 *
 * Returns the array index for the splice operation (i.e. the index of
 * the FIRST bend point AFTER which the new one belongs in
 * pipe.bendPoints — accounting for the from/to endpoints not being
 * stored in bendPoints).
 */
export function findBendInsertionIndex(
  pipe: SchemePipe,
  from: SchemeNode,
  to: SchemeNode,
  clickPx: { x: number; y: number },
): number {
  const path = resolvePipePath(pipe, from, to);
  if (path.length < 2) return 0;
  let bestSegmentIdx = 0;
  let bestDist = Infinity;
  for (let i = 0; i < path.length - 1; i += 1) {
    const a = path[i]!;
    const b = path[i + 1]!;
    const d = perpendicularDistance(clickPx, a, b);
    if (d < bestDist) {
      bestDist = d;
      bestSegmentIdx = i;
    }
  }
  // bestSegmentIdx is 0..(path.length-2). Path is [from, ...bendPoints, to].
  // If we insert at bestSegmentIdx in the FULL path, that converts to
  // bendPoint-array index bestSegmentIdx (because from is at full-path
  // index 0, and bend point n is at full-path index n+1).
  // So splice position in pipe.bendPoints is bestSegmentIdx.
  return bestSegmentIdx;
}

/** Perpendicular distance from a point to a line segment. */
function perpendicularDistance(
  p: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const segLenSq = dx * dx + dy * dy;
  if (segLenSq < 0.0001) {
    return Math.hypot(p.x - a.x, p.y - a.y);
  }
  // Project p onto the segment, clamp t to [0, 1]
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / segLenSq;
  t = Math.max(0, Math.min(1, t));
  const closestX = a.x + t * dx;
  const closestY = a.y + t * dy;
  return Math.hypot(p.x - closestX, p.y - closestY);
}

/**
 * Add a bend point to a pipe at the best insertion index. Returns
 * the new bendPoints array (immutable update).
 */
export function addBendPoint(
  pipe: SchemePipe,
  from: SchemeNode,
  to: SchemeNode,
  newPointPx: { x: number; y: number; lat?: number; lon?: number },
): BendPoint[] {
  const existing = pipe.bendPoints ?? [];
  const idx = findBendInsertionIndex(pipe, from, to, newPointPx);
  const next = [...existing];
  next.splice(idx, 0, newPointPx);
  return next;
}

/**
 * Remove the bend point at the given index. Returns the new
 * bendPoints array (immutable update).
 */
export function removeBendPoint(
  pipe: SchemePipe,
  bendIndex: number,
): BendPoint[] {
  const existing = pipe.bendPoints ?? [];
  if (bendIndex < 0 || bendIndex >= existing.length) return existing;
  return existing.filter((_, i) => i !== bendIndex);
}

/**
 * Move a bend point to a new position. Returns the new bendPoints
 * array (immutable update).
 */
export function moveBendPoint(
  pipe: SchemePipe,
  bendIndex: number,
  newPos: { x: number; y: number; lat?: number; lon?: number },
): BendPoint[] {
  const existing = pipe.bendPoints ?? [];
  if (bendIndex < 0 || bendIndex >= existing.length) return existing;
  const next = [...existing];
  next[bendIndex] = newPos;
  return next;
}

/**
 * Deflection angle at a polyline vertex, in DEGREES.
 *
 * Phase 13.39 — engineer report: "Шугам хэдэн Градус эргэж байгааг
 * үураг дээр яг тухайн буланд нь тоогоор харуулмаар байна". We
 * label every intermediate vertex on the canvas with this value
 * so the engineer can verify their routing matches the real-world
 * elbow (45° / 90° standard fittings, or arbitrary degrees for
 * free-snap layouts).
 *
 * Definition: deflection = how much the pipe direction CHANGES at
 * the vertex.
 *   - 0°   → straight (the three points are collinear; no real bend)
 *   - 45°  → standard 45° elbow
 *   - 90°  → standard 90° elbow
 *   - 180° → U-turn (pipe folds back on itself)
 *
 * Computation: angle between the incoming direction (prev→bend)
 * and the outgoing direction (bend→next), via acos of the dot
 * product of the unit vectors. Always returns a value in [0, 180].
 *
 * Returns 0 for degenerate input (zero-length incoming or outgoing
 * segment) so the renderer can safely skip labels < 5°.
 */
export function bendDeflectionDeg(
  prev: { x: number; y: number },
  bend: { x: number; y: number },
  next: { x: number; y: number },
): number {
  const inX = bend.x - prev.x;
  const inY = bend.y - prev.y;
  const outX = next.x - bend.x;
  const outY = next.y - bend.y;
  const inLen = Math.hypot(inX, inY);
  const outLen = Math.hypot(outX, outY);
  if (inLen < 0.001 || outLen < 0.001) return 0;
  const dot = (inX * outX + inY * outY) / (inLen * outLen);
  const clamped = Math.max(-1, Math.min(1, dot));
  return (Math.acos(clamped) * 180) / Math.PI;
}

/**
 * Outward bisector unit vector at a polyline vertex.
 *
 * Used to position the deflection-angle label so it sits on the
 * OUTSIDE of the bend (the convex side), where it doesn't overlap
 * the pipe stroke or the small bend-point drag handle.
 *
 * Geometric definition: the bisector of the EXTERIOR angle. Given
 * unit vectors u (prev→bend, INTO the bend) and v (bend→next, OUT
 * of the bend), the outward bisector is normalize(−u − v). For a
 * right-angle turn (u=(1,0), v=(0,1)), this returns (−1,−1)/√2 —
 * pointing into the convex corner.
 *
 * Returns (0, 0) for degenerate / straight-line input. The caller
 * is expected to fall back to a sensible default position.
 */
export function bendOutwardBisector(
  prev: { x: number; y: number },
  bend: { x: number; y: number },
  next: { x: number; y: number },
): { x: number; y: number } {
  const inX = bend.x - prev.x;
  const inY = bend.y - prev.y;
  const outX = next.x - bend.x;
  const outY = next.y - bend.y;
  const inLen = Math.hypot(inX, inY);
  const outLen = Math.hypot(outX, outY);
  if (inLen < 0.001 || outLen < 0.001) return { x: 0, y: 0 };
  const uX = inX / inLen;
  const uY = inY / inLen;
  const vX = outX / outLen;
  const vY = outY / outLen;
  // Straight-line check: u · v ≈ 1 means the two segments share a
  // direction — there's no real bend, so the bisector is undefined.
  // Return (0, 0) so the caller can fall back to the bend position
  // itself (label suppressed when paired with the deflection < 5°
  // guard in the renderer).
  const dot = uX * vX + uY * vY;
  if (dot > 0.9999) return { x: 0, y: 0 };
  // U-turn check: u · v ≈ -1 means the pipe folds back on itself.
  // -(u + v) is then (0, 0) — degenerate. Pick the unit perpendicular
  // to u (rotated 90° CCW) as a reasonable label side. Engineers
  // rarely route a true U-turn but this avoids a NaN on degenerate
  // imports.
  if (dot < -0.9999) return { x: -uY, y: uX };
  const bX = -(uX + vX);
  const bY = -(uY + vY);
  const bLen = Math.hypot(bX, bY);
  if (bLen < 0.001) return { x: 0, y: 0 };
  return { x: bX / bLen, y: bY / bLen };
}
