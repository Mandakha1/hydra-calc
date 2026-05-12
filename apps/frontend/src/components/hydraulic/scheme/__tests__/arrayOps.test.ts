/**
 * Phase 6.5.4 — Array operations tests.
 *
 * Engineering-correctness checks for `linearArray` + `polarArray`:
 *
 *   1. Linear 1×10 spacing 30 m on a single АОС → 9 copies in a row
 *      at expected x positions (the "row of identical buildings").
 *   2. Linear 3×2 (rows × cols), spacing 5 m → 5 copies arranged in
 *      the grid pattern, original at (0,0), copies fill the rest.
 *   3. Linear honours direction: Right-Down vs Left-Up flips signs.
 *   4. Polar 8 copies, full circle (sweep=360) → original + 7 copies
 *      at 0°, 45°, 90°, …, 315° around the centre, all at same
 *      radius from the centre.
 *   5. Polar 4 copies, sweep=90° starting at 0° → 4 evenly placed
 *      at 0°, 22.5°, 45°, 67.5° (quarter-arc fan).
 *   6. Array preserves entity type (АОС stays АОС for every copy).
 *   7. Array generates fresh non-colliding IDs across many copies.
 *   8. Linear 1×1 (degenerate "no array") returns 0 copies.
 *   9. Polar count<2 returns 0 copies.
 *  10. Polar rotateEachWithArray=true rotates each cluster about its
 *      own centroid by the position angle (cluster orientation
 *      tracks the orbit).
 *  11. Linear preserves intra-payload pipes (topology within each
 *      copy intact; no inter-copy pipes generated).
 */
import { describe, it, expect } from "vitest";
import { linearArray, polarArray } from "../arrayOps";
import { buildClipboardPayload } from "../clipboard";
import type { SchemeNode, SchemePipe } from "../../hydraulicTypes";

function makeUidGen() {
  let counter = 0;
  return (prefix = "x") => {
    counter += 1;
    return `${prefix}_${counter}`;
  };
}

/** Tiny network: two AOS nodes + one pipe between them. */
function makeMicroPayload() {
  const nodes: SchemeNode[] = [
    { id: "a", kind: "consumer_apartment", label: "A", x: 0, y: 0, heatLoad_w: 50_000 },
    { id: "b", kind: "consumer_apartment", label: "B", x: 10, y: 0, heatLoad_w: 30_000 },
  ];
  const pipes: SchemePipe[] = [
    {
      id: "p1", fromNodeId: "a", toNodeId: "b",
      materialKey: "steel_new", dn: 32, length_m: 10,
      circuit: "heating_supply",
    },
  ];
  return buildClipboardPayload(nodes, pipes, ["a", "b"], ["p1"])!;
}

/** Single-node payload at (0, 0) — useful for pure positional tests. */
function makeSingleNodePayload() {
  const nodes: SchemeNode[] = [{
    id: "a", kind: "consumer_apartment", label: "Solo", x: 0, y: 0,
  }];
  return buildClipboardPayload(nodes, [], ["a"], [])!;
}

describe("linearArray — Phase 6.5.4", () => {
  it("1×10 with 30 m spacing → 9 copies along x axis (row layout)", () => {
    const payload = makeSingleNodePayload();
    const copies = linearArray(
      payload,
      { rows: 1, cols: 10, rowSpacing_m: 30, colSpacing_m: 30, direction: "Right-Down" },
      makeUidGen(),
    );
    // 1×10 means 1 row + 10 cols = 10 cells; original at (0,0); 9 copies.
    expect(copies).toHaveLength(9);
    // Copies j=1..9 should be at x = j·30 (rowSpacing not used when rows=1).
    for (let i = 0; i < copies.length; i += 1) {
      const expectedX = (i + 1) * 30;
      expect(copies[i]!.nodes[0]!.x).toBe(expectedX);
      expect(copies[i]!.nodes[0]!.y).toBe(0);
    }
  });

  it("3×2 (3 rows × 2 cols), 5 m × 5 m spacing → 5 copies, grid pattern", () => {
    const payload = makeSingleNodePayload();
    const copies = linearArray(
      payload,
      { rows: 3, cols: 2, rowSpacing_m: 5, colSpacing_m: 5, direction: "Right-Down" },
      makeUidGen(),
    );
    // 3×2 = 6 cells; original at (0,0) skipped; 5 copies.
    expect(copies).toHaveLength(5);
    // Expected positions: (1,0)=col1 row0, (0,1)=col0 row1, (1,1), (0,2), (1,2).
    const expectedSet = new Set([
      "5,0", // i=0,j=1 → x=5, y=0
      "0,5", // i=1,j=0
      "5,5", // i=1,j=1
      "0,10", // i=2,j=0
      "5,10", // i=2,j=1
    ]);
    const actualSet = new Set(copies.map((c) => `${c.nodes[0]!.x},${c.nodes[0]!.y}`));
    expect(actualSet).toEqual(expectedSet);
  });

  it("direction 'Left-Up' flips both signs", () => {
    const payload = makeSingleNodePayload();
    const copies = linearArray(
      payload,
      { rows: 2, cols: 2, rowSpacing_m: 10, colSpacing_m: 10, direction: "Left-Up" },
      makeUidGen(),
    );
    // 2×2 = 3 copies. Right-Down would give positive x/y; Left-Up flips.
    expect(copies).toHaveLength(3);
    const positions = copies.map((c) => `${c.nodes[0]!.x},${c.nodes[0]!.y}`).sort();
    expect(positions).toEqual([
      "-10,-10",
      "-10,0",
      "0,-10",
    ]);
  });

  it("1×1 (degenerate — no actual array) returns 0 copies", () => {
    const payload = makeSingleNodePayload();
    const copies = linearArray(
      payload,
      { rows: 1, cols: 1, rowSpacing_m: 30, colSpacing_m: 30, direction: "Right-Down" },
      makeUidGen(),
    );
    expect(copies).toHaveLength(0);
  });

  it("preserves entity type (АОС stays АОС for every copy)", () => {
    const payload = makeSingleNodePayload();
    const copies = linearArray(
      payload,
      { rows: 2, cols: 3, rowSpacing_m: 20, colSpacing_m: 20, direction: "Right-Down" },
      makeUidGen(),
    );
    for (const c of copies) {
      expect(c.nodes[0]!.kind).toBe("consumer_apartment");
      expect(c.nodes[0]!.label).toBe("Solo");
    }
  });

  it("preserves intra-payload pipes (topology within each copy)", () => {
    const payload = makeMicroPayload();
    const copies = linearArray(
      payload,
      { rows: 1, cols: 3, rowSpacing_m: 50, colSpacing_m: 50, direction: "Right-Down" },
      makeUidGen(),
    );
    expect(copies).toHaveLength(2);
    for (const c of copies) {
      // Each copy contains 2 nodes + 1 pipe.
      expect(c.nodes).toHaveLength(2);
      expect(c.pipes).toHaveLength(1);
      // The pipe connects the copy's own new IDs (not the originals).
      const pipe = c.pipes[0]!;
      expect(c.nodes.find((n) => n.id === pipe.fromNodeId)).toBeDefined();
      expect(c.nodes.find((n) => n.id === pipe.toNodeId)).toBeDefined();
      // Pipe shape preserved: dn, material, length.
      expect(pipe.dn).toBe(32);
      expect(pipe.materialKey).toBe("steel_new");
      expect(pipe.length_m).toBe(10);
    }
  });

  it("generates fresh non-colliding IDs across many copies", () => {
    const payload = makeMicroPayload();
    const uid = makeUidGen();
    const copies = linearArray(
      payload,
      { rows: 5, cols: 5, rowSpacing_m: 20, colSpacing_m: 20, direction: "Right-Down" },
      uid,
    );
    expect(copies).toHaveLength(24); // 5×5 - 1 = 24
    const allIds = new Set<string>();
    for (const c of copies) {
      for (const n of c.nodes) allIds.add(n.id);
      for (const p of c.pipes) allIds.add(p.id);
    }
    // 24 copies × (2 nodes + 1 pipe) = 72 unique IDs.
    expect(allIds.size).toBe(72);
  });
});

describe("polarArray — Phase 6.5.4", () => {
  it("8 copies on a full circle → 7 copies at 45° increments around centre", () => {
    // Place a single node at (100, 0); centre is the origin. Original
    // at angle 0°. With sweep=360 and count=8, copies land at
    // 45°, 90°, …, 315°.
    const payload = makeSingleNodePayload();
    const originalAt: SchemeNode[] = [{
      ...payload.nodes[0]!,
      x: 100, y: 0,
    }];
    const positioned = { ...payload, nodes: originalAt };
    const copies = polarArray(
      positioned,
      { center_px: { x: 0, y: 0 }, count: 8, sweepAngleDeg: 360 },
      makeUidGen(),
    );
    expect(copies).toHaveLength(7);
    // Each copy should be at radius 100 from centre.
    for (let i = 0; i < copies.length; i += 1) {
      const node = copies[i]!.nodes[0]!;
      const r = Math.hypot(node.x, node.y);
      expect(r).toBeCloseTo(100, 0);
    }
    // Verify each angle: k=1..7, angle_k = 0 + k*45°.
    const expectedAngles = [45, 90, 135, 180, 225, 270, 315];
    for (let i = 0; i < copies.length; i += 1) {
      const node = copies[i]!.nodes[0]!;
      const actualDeg = (Math.atan2(node.y, node.x) * 180) / Math.PI;
      // atan2 returns -180..180, convert negative angles to 0..360.
      const normalized = actualDeg < 0 ? actualDeg + 360 : actualDeg;
      expect(normalized).toBeCloseTo(expectedAngles[i]!, 0);
    }
  });

  it("4 copies on a 90° arc starting at 0° → quarter-fan layout", () => {
    // 4 copies / 90° sweep → step 22.5°. Original at 0°, copies at
    // 22.5°, 45°, 67.5°.
    const payload = makeSingleNodePayload();
    const originalAt: SchemeNode[] = [{ ...payload.nodes[0]!, x: 100, y: 0 }];
    const positioned = { ...payload, nodes: originalAt };
    const copies = polarArray(
      positioned,
      { center_px: { x: 0, y: 0 }, count: 4, startAngleDeg: 0, sweepAngleDeg: 90 },
      makeUidGen(),
    );
    expect(copies).toHaveLength(3);
    const expectedAngles = [22.5, 45, 67.5];
    for (let i = 0; i < copies.length; i += 1) {
      const node = copies[i]!.nodes[0]!;
      const actualDeg = (Math.atan2(node.y, node.x) * 180) / Math.PI;
      expect(actualDeg).toBeCloseTo(expectedAngles[i]!, 0);
    }
  });

  it("count<2 returns 0 copies (degenerate)", () => {
    const payload = makeSingleNodePayload();
    expect(polarArray(payload, {
      center_px: { x: 0, y: 0 }, count: 0, sweepAngleDeg: 360,
    }, makeUidGen())).toEqual([]);
    expect(polarArray(payload, {
      center_px: { x: 0, y: 0 }, count: 1, sweepAngleDeg: 360,
    }, makeUidGen())).toEqual([]);
  });

  it("rotateEachWithArray=true rotates each cluster about its own centroid", () => {
    // Two-node cluster oriented east-west; place at (100, 0), full
    // circle, rotateEachWithArray=true. Each clone's nodes should
    // be rotated by k·step around its own centroid so the cluster
    // orientation tracks the orbit.
    const orig: SchemeNode[] = [
      { id: "a", kind: "consumer_apartment", label: "A", x: 95, y: 0 },
      { id: "b", kind: "consumer_apartment", label: "B", x: 105, y: 0 },
    ];
    const payload = buildClipboardPayload(orig, [], ["a", "b"], [])!;
    const copies = polarArray(
      payload,
      { center_px: { x: 0, y: 0 }, count: 4, sweepAngleDeg: 360, rotateEachWithArray: true },
      makeUidGen(),
    );
    expect(copies).toHaveLength(3);
    // After 90° rotation, the second copy's cluster should be oriented
    // north-south (perpendicular to its own orbit-radial-direction).
    // The centroid of copy 0 (90°) sits at (0, 100); its two nodes
    // should have the same x but different y, separated by 10 px.
    const firstCopy = copies[0]!.nodes;
    const dx = firstCopy[1]!.x - firstCopy[0]!.x;
    const dy = firstCopy[1]!.y - firstCopy[0]!.y;
    const segLength = Math.hypot(dx, dy);
    expect(segLength).toBeCloseTo(10, 0); // length preserved
    // After 90° CCW rotation, originally-east-west now north-south.
    expect(Math.abs(dx)).toBeLessThan(2); // dx ≈ 0
    expect(Math.abs(dy)).toBeGreaterThan(8); // dy ≈ ±10
  });

  it("rotateEachWithArray=false keeps cluster orientation constant", () => {
    // Same setup as above but rotateEachWithArray=false. The cluster
    // is just translated to each new position without internal rotation.
    const orig: SchemeNode[] = [
      { id: "a", kind: "consumer_apartment", label: "A", x: 95, y: 0 },
      { id: "b", kind: "consumer_apartment", label: "B", x: 105, y: 0 },
    ];
    const payload = buildClipboardPayload(orig, [], ["a", "b"], [])!;
    const copies = polarArray(
      payload,
      { center_px: { x: 0, y: 0 }, count: 4, sweepAngleDeg: 360, rotateEachWithArray: false },
      makeUidGen(),
    );
    // At copy k=1 (angle 90° from start, so 90°+0=90° but original was
    // at 0°+90°=90°? Actually angle progression). Cluster stays
    // east-west (parallel to its original orientation).
    const firstCopy = copies[0]!.nodes;
    const dx = firstCopy[1]!.x - firstCopy[0]!.x;
    const dy = firstCopy[1]!.y - firstCopy[0]!.y;
    // East-west orientation preserved: dx ≈ ±10, dy ≈ 0.
    expect(Math.abs(dx)).toBeGreaterThan(8);
    expect(Math.abs(dy)).toBeLessThan(2);
  });

  it("generates fresh non-colliding IDs across all polar copies", () => {
    const payload = makeMicroPayload();
    const copies = polarArray(
      payload,
      { center_px: { x: -50, y: 0 }, count: 12, sweepAngleDeg: 360 },
      makeUidGen(),
    );
    expect(copies).toHaveLength(11);
    const allIds = new Set<string>();
    for (const c of copies) {
      for (const n of c.nodes) allIds.add(n.id);
      for (const p of c.pipes) allIds.add(p.id);
    }
    // 11 copies × 3 IDs each (2 nodes + 1 pipe) = 33 unique IDs.
    expect(allIds.size).toBe(33);
  });

  it("preserves intra-payload topology (pipes within each copy intact)", () => {
    const payload = makeMicroPayload();
    const copies = polarArray(
      payload,
      { center_px: { x: -50, y: 0 }, count: 4, sweepAngleDeg: 360 },
      makeUidGen(),
    );
    expect(copies).toHaveLength(3);
    for (const c of copies) {
      const pipe = c.pipes[0]!;
      expect(c.nodes.find((n) => n.id === pipe.fromNodeId)).toBeDefined();
      expect(c.nodes.find((n) => n.id === pipe.toNodeId)).toBeDefined();
    }
  });
});
