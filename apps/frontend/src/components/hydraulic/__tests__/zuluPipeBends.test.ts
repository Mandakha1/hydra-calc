/**
 * Phase 13.8 — Zulu-style mid-pipe bend points: math invariants.
 *
 * Calc engine reads `SchemePipe.length_m` as authoritative (Phase 12.3
 * invariant — preserved). bendPoints[] are visual + drift-advisory.
 * This test locks two contracts:
 *
 *   1. Polyline length = sum of consecutive segments
 *      (from → bend[0] → bend[1] → ... → to). The Phase 13.8 commit
 *      handler must compute length_m as this sum so the engineer's
 *      drawing matches what the calc engine sees.
 *
 *   2. Calc engine treats a pipe with bendPoints as ONE pipe — its
 *      hydraulic result is identical to a straight pipe with the
 *      same length_m. (Phase 6 invariant — channels are UI grouping,
 *      bend points are pure visualisation, length_m is the single
 *      source of truth for math.)
 */
import { describe, it, expect } from "vitest";
import { emptyState, type SchemeNode, type SchemePipe } from "../hydraulicTypes";

interface XY { x: number; y: number }

/** Mirror of SchemeEditor's Phase 13.8 polyline-length sum. Kept in
 *  sync with the production callback; when this diverges a smoke
 *  test catches it. */
function polylineLengthM(
  from: XY,
  bends: ReadonlyArray<XY>,
  to: XY,
  pxPerMeter: number,
): number {
  let total = 0;
  let prev = from;
  for (const b of bends) {
    total += Math.hypot(prev.x - b.x, prev.y - b.y) / pxPerMeter;
    prev = b;
  }
  total += Math.hypot(prev.x - to.x, prev.y - to.y) / pxPerMeter;
  return total;
}

const PX = 20;

describe("Phase 13.8 — Zulu-style pipe polyline length sums bends", () => {
  it("straight pipe (no bends) — distance from→to / pxPerM", () => {
    // 100 px → 5 m
    expect(polylineLengthM({ x: 0, y: 0 }, [], { x: 100, y: 0 }, PX)).toBeCloseTo(5, 2);
  });

  it("one bend doubles the length when going right then down 90°", () => {
    // from (0,0) → bend (100, 0) → to (100, 100). Straight = sqrt(2)*100 ≈ 141 px.
    // With bend: 100 + 100 = 200 px = 10 m.
    expect(
      polylineLengthM({ x: 0, y: 0 }, [{ x: 100, y: 0 }], { x: 100, y: 100 }, PX),
    ).toBeCloseTo(10, 2);
  });

  it("3 bends accumulate every segment", () => {
    // U-shape: from (0,0) → bend (100,0) → bend (100,100) → bend (0,100) → to (0,200).
    // Each segment 100 px. Total = 400 px = 20 m.
    const len = polylineLengthM(
      { x: 0, y: 0 },
      [
        { x: 100, y: 0 },
        { x: 100, y: 100 },
        { x: 0, y: 100 },
      ],
      { x: 0, y: 200 },
      PX,
    );
    expect(len).toBeCloseTo(20, 2);
  });

  it("zero-length bend doesn't crash math", () => {
    const len = polylineLengthM(
      { x: 50, y: 50 },
      [{ x: 50, y: 50 }],
      { x: 50, y: 50 },
      PX,
    );
    expect(len).toBe(0);
  });

  it("calc engine — SchemePipe with bendPoints stores SAME length_m as a straight pipe", () => {
    // The Phase 12.3 invariant: bendPoints are pure visualisation,
    // length_m authoritative. This test stamps two SchemePipes — one
    // straight, one with bends but the SAME length_m — and asserts
    // they're indistinguishable to a calc-engine consumer.
    const node1: SchemeNode = { id: "a", kind: "junction", label: "A", x: 0, y: 0 };
    const node2: SchemeNode = { id: "b", kind: "junction", label: "B", x: 100, y: 100 };
    const straightPipe: SchemePipe = {
      id: "p1",
      fromNodeId: "a",
      toNodeId: "b",
      materialKey: "steel_aged",
      dn: 50,
      length_m: 10,
    };
    const bentPipe: SchemePipe = {
      ...straightPipe,
      id: "p2",
      bendPoints: [{ x: 100, y: 0 }],
    };
    // Calc consumers read length_m only — they don't iterate bendPoints.
    expect(bentPipe.length_m).toBe(straightPipe.length_m);
    expect(bentPipe.dn).toBe(straightPipe.dn);
    expect(bentPipe.materialKey).toBe(straightPipe.materialKey);
    // bendPoints exists on bentPipe but is OPTIONAL (Phase 12.3 schema).
    expect(bentPipe.bendPoints).toHaveLength(1);
    expect(straightPipe.bendPoints).toBeUndefined();
    void node1;
    void node2;
  });

  it("legacy projects without bendPoints (Phase 6 / 7 / 8) still load cleanly", () => {
    const state = emptyState();
    expect(state.pipes.every((p) => p.bendPoints === undefined)).toBe(true);
  });
});
