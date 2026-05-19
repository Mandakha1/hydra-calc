/**
 * Phase 13.20 — Visual offset for parallel pipes sharing endpoints.
 *
 * Engineer report: "Газрын зураг дээр жижиг барилга дээр давхарлаж
 * зурхад алдаа их гарч цэгүүд зөрж байна."
 *
 * Mongolian heat-network design lays multiple pipes (Т1 + Т2 + Т3 + Т4
 * + В1) inside one trench between the same two buildings. With Phase
 * 13.18 the engineer can now draw all five at once via the Mouse-2
 * picker — but every pipe shares the same `fromNodeId` / `toNodeId` /
 * `bendPoints` / `length_m`, so without an offset they render literally
 * on top of each other. Visually only the top-most circuit is visible,
 * the others appear as one fat line. Engineer sees the bend points
 * "drift" because clicking a bend handle ends up grabbing whichever
 * pipe got rendered last at that pixel.
 *
 * This helper computes a CIRCUIT-CANONICAL offset index per pipe:
 *   - All pipes sharing the same endpoint pair (direction-invariant)
 *     are grouped together.
 *   - Within the group, pipes are sorted by canonical circuit order
 *     (Т1 → Т2 → Т3 → Т4 → В1) so two engineers drawing the same
 *     5-circuit trench always see the same visual stacking.
 *   - Index is CENTRED on zero, so for N=5 the indices are -2..+2.
 *   - The renderer multiplies index × SPACING_PX to derive the
 *     perpendicular offset distance.
 *
 * Pure functions only — no DOM, no React. Trivially unit-tested via
 * synthetic SchemePipe lists in `parallelPipeOffset.test.ts`.
 */

import type { SchemePipe } from "../hydraulicTypes";
import type { PipeCircuit } from "../nodeCatalog";

/** Perpendicular spacing between adjacent parallel pipes (SVG pixels).
 *  4 px is a deliberate compromise: visible at street zoom + doesn't
 *  blanket the underlying OSM building footprint at city overview
 *  zoom. Caller can scale this with map zoom if they want, but
 *  Mongolian district plans usually print at 1:500-1:1000 so a fixed
 *  4 px reads correctly on paper too. */
export const DEFAULT_PARALLEL_SPACING_PX = 4;

/** Canonical render order for the 5 standard circuits. Pipes outside
 *  this list (engineer-extended circuits) fall to the end in their
 *  insertion order. */
const CIRCUIT_ORDER: ReadonlyArray<PipeCircuit> = [
  "heating_supply",
  "heating_return",
  "dhw_supply",
  "dhw_recirc",
  "cold_water",
];

function circuitOrder(circuit: PipeCircuit | undefined): number {
  if (!circuit) return 999;
  const idx = CIRCUIT_ORDER.indexOf(circuit);
  return idx >= 0 ? idx : 999;
}

/** Direction-invariant key — pipes sharing (A→B) and (B→A) endpoints
 *  group together so the engineer's mental model of "the trench
 *  between buildings A and B" matches the visual stack regardless of
 *  which direction each pipe was drawn in. */
function pairKey(p: SchemePipe): string {
  return p.fromNodeId < p.toNodeId
    ? `${p.fromNodeId}|${p.toNodeId}`
    : `${p.toNodeId}|${p.fromNodeId}`;
}

/**
 * Compute the parallel-offset index for every pipe.
 *
 * Returns a `Map<pipeId, offsetIndex>` where:
 *   - offsetIndex = 0 for pipes that are the only one between their
 *     endpoint pair (no shift — engineer sees the original geometry).
 *   - offsetIndex = (i - (N-1)/2) for pipes in a group of size N>1,
 *     sorted by `circuitOrder`.
 *
 * Examples:
 *   N=2 → offsets = [-0.5, +0.5]   (centred either side of the original line)
 *   N=3 → offsets = [-1, 0, +1]
 *   N=4 → offsets = [-1.5, -0.5, +0.5, +1.5]
 *   N=5 → offsets = [-2, -1, 0, +1, +2]
 *
 * The renderer multiplies these by `DEFAULT_PARALLEL_SPACING_PX` to
 * get the perpendicular shift in scheme-pixels.
 */
export function computeParallelOffsets(
  pipes: ReadonlyArray<SchemePipe>,
): Map<string, number> {
  const groups = new Map<string, SchemePipe[]>();
  for (const p of pipes) {
    // Channel-grouped pipes render as one channel polyline (Phase
    // 12.5) — skip them so we don't fan out trench-internal pipes
    // back into separate lines.
    if (p.channelId) continue;
    const key = pairKey(p);
    let group = groups.get(key);
    if (!group) {
      group = [];
      groups.set(key, group);
    }
    group.push(p);
  }
  const offsets = new Map<string, number>();
  for (const [, group] of groups) {
    if (group.length <= 1) {
      // Singleton — no shift. Render at the original geometry.
      for (const p of group) offsets.set(p.id, 0);
      continue;
    }
    // Sort by canonical circuit order; ties broken by id for stability
    // (the second engineer-drawn Т1 lands beside the first Т1, not
    // randomly stacked).
    group.sort((a, b) => {
      const oa = circuitOrder(a.circuit);
      const ob = circuitOrder(b.circuit);
      if (oa !== ob) return oa - ob;
      return a.id.localeCompare(b.id);
    });
    const N = group.length;
    for (let i = 0; i < N; i += 1) {
      // Centred about zero. Half-integer offsets for even N look fine
      // because the spacing × index multiplier resolves to pixels.
      offsets.set(group[i]!.id, i - (N - 1) / 2);
    }
  }
  return offsets;
}

/**
 * Unit perpendicular vector for the segment a → b, rotated 90° CCW.
 *
 * Returns the zero vector when the segment is degenerate (|a-b| < eps)
 * so the caller falls back to zero offset (matches the "skip parallel
 * shift for a single-point pipe" expectation in the renderer).
 */
export function perpendicularUnit(
  a: { x: number; y: number },
  b: { x: number; y: number },
): { x: number; y: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < 0.1) return { x: 0, y: 0 };
  // Rotate (dx, dy) 90° CCW → (-dy, dx). Divide by length to unit-scale.
  return { x: -dy / len, y: dx / len };
}

/**
 * Apply a parallel offset to a list of points. The perpendicular is
 * computed once from the first → last endpoints so the polyline shifts
 * as a rigid body (each point shifted by the same vector). Renders a
 * true geometric parallel for straight pipes; for bent pipes, the
 * offset isn't a strict parallel polyline but the visual separation
 * is still correct (and engineers don't expect strict offset polylines
 * — they expect the trench to "look like a trench" at the zoom they're
 * working at).
 */
export function offsetPolyline(
  points: ReadonlyArray<{ x: number; y: number }>,
  offsetIndex: number,
  spacing_px: number = DEFAULT_PARALLEL_SPACING_PX,
): { x: number; y: number }[] {
  if (points.length < 2 || offsetIndex === 0) {
    return points.map((p) => ({ x: p.x, y: p.y }));
  }
  const a = points[0]!;
  const b = points[points.length - 1]!;
  const perp = perpendicularUnit(a, b);
  const distance = offsetIndex * spacing_px;
  const dx = perp.x * distance;
  const dy = perp.y * distance;
  return points.map((p) => ({ x: p.x + dx, y: p.y + dy }));
}
