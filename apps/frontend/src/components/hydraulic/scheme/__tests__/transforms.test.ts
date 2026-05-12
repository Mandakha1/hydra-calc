/**
 * Phase 6.5.3 — group-transform math tests.
 *
 * Engineering invariants locked here:
 *   1. translate preserves shape — every node shifts by exactly the
 *      same vector; relative distances are conserved.
 *   2. rotate 90° CCW around origin: (1, 0) → (0, 1); 180°: (10, 5)
 *      around (5, 5) → (0, 5).
 *   3. rotate preserves pipe topology (we only touch coordinates, so
 *      any pre-rotation pipe.fromNodeId continues to point to the
 *      same node after).
 *   4. mirror horizontal across y=10: (5, 5) → (5, 15).
 *   5. mirror vertical across x=10: (5, 5) → (15, 5).
 *   6. mirror across the 2-point line (0,0)-(1,1) (a diagonal):
 *      (1, 0) → (0, 1).
 *   7. translate, rotate, mirror all preserve node count + IDs.
 *   8. snap-angle simulation (caller passes pre-snapped angleDeg)
 *      lands on the nearest 45° / 90° multiple — verifies the math
 *      is exact at those increments, not floating-point drift.
 *   9. geo-coord rotation: a node at lat 47.9184 ° rotated 90° CCW
 *      around the centroid stays at the same distance (cluster
 *      shape preserved geographically).
 *  10. centroidPx + centroidGeo helpers — averaging behaviour.
 */
import { describe, it, expect } from "vitest";
import {
  translateNodes,
  rotateNodes,
  mirrorNodes,
  centroidPx,
  centroidGeo,
} from "../transforms";
import type { SchemeNode } from "../../hydraulicTypes";

function node(id: string, x: number, y: number, geo?: { lat: number; lon: number }): SchemeNode {
  return {
    id,
    kind: "consumer_apartment",
    label: `N-${id}`,
    x,
    y,
    ...(geo ? { geo } : {}),
  };
}

describe("translateNodes — Phase 6.5.3", () => {
  it("shifts every node by the same pixel delta (group move semantics)", () => {
    const nodes = [node("a", 10, 20), node("b", 50, 80), node("c", -5, 12)];
    const out = translateNodes(nodes, { x: 30, y: -40 });
    expect(out).toHaveLength(3);
    expect(out[0]).toMatchObject({ x: 40, y: -20 });
    expect(out[1]).toMatchObject({ x: 80, y: 40 });
    expect(out[2]).toMatchObject({ x: 25, y: -28 });
  });

  it("preserves IDs and other node fields", () => {
    const nodes = [{
      id: "src", kind: "source_substation", label: "Source",
      x: 0, y: 0, elevation_m: 1269, heatLoad_w: 50_000,
    } satisfies SchemeNode];
    const out = translateNodes(nodes, { x: 100, y: 100 });
    expect(out[0]!.id).toBe("src");
    expect(out[0]!.kind).toBe("source_substation");
    expect(out[0]!.label).toBe("Source");
    expect(out[0]!.elevation_m).toBe(1269);
    expect(out[0]!.heatLoad_w).toBe(50_000);
  });

  it("shifts geo coords via Haversine m → deg conversion when metre delta provided", () => {
    const a = node("g", 0, 0, { lat: 47.9184, lon: 106.9176 });
    const out = translateNodes([a], { x: 50, y: 50 }, { x: 20, y: 20 });
    // 20 m east at lat 47.92 ≈ 0.000268° longitude; 20 m north ≈
    // 0.0001798° latitude (same Haversine math used by symbolSize).
    const dLat = out[0]!.geo!.lat - 47.9184;
    const dLon = out[0]!.geo!.lon - 106.9176;
    expect(dLat).toBeGreaterThan(0.00017);
    expect(dLat).toBeLessThan(0.00019);
    expect(dLon).toBeGreaterThan(0.00025);
    expect(dLon).toBeLessThan(0.00029);
  });
});

describe("rotateNodes — Phase 6.5.3", () => {
  it("rotates 90° CCW around origin: (1, 0) → (0, 1)", () => {
    const nodes = [node("a", 1, 0)];
    const out = rotateNodes(nodes, { x: 0, y: 0 }, 90);
    expect(out[0]!.x).toBeCloseTo(0, 5);
    expect(out[0]!.y).toBeCloseTo(1, 5);
  });

  it("rotates 90° CW (-90°) around origin: (1, 0) → (0, -1)", () => {
    const out = rotateNodes([node("a", 1, 0)], { x: 0, y: 0 }, -90);
    expect(out[0]!.x).toBeCloseTo(0, 5);
    expect(out[0]!.y).toBeCloseTo(-1, 5);
  });

  it("rotates 180° around center (5, 5): (10, 5) → (0, 5)", () => {
    const out = rotateNodes([node("a", 10, 5)], { x: 5, y: 5 }, 180);
    expect(out[0]!.x).toBeCloseTo(0, 5);
    expect(out[0]!.y).toBeCloseTo(5, 5);
  });

  it("preserves group shape (relative distances unchanged after rotation)", () => {
    const nodes = [node("a", 0, 0), node("b", 100, 0), node("c", 100, 100)];
    const out = rotateNodes(nodes, { x: 50, y: 50 }, 90);
    // Compute pairwise distances before and after.
    const distAB_before = Math.hypot(100, 0);
    const distAB_after = Math.hypot(out[1]!.x - out[0]!.x, out[1]!.y - out[0]!.y);
    expect(distAB_after).toBeCloseTo(distAB_before, 3);
    const distBC_before = Math.hypot(0, 100);
    const distBC_after = Math.hypot(out[2]!.x - out[1]!.x, out[2]!.y - out[1]!.y);
    expect(distBC_after).toBeCloseTo(distBC_before, 3);
  });

  it("preserves node IDs (topology preservation invariant)", () => {
    const nodes = [node("alpha", 1, 1), node("beta", 2, 2), node("gamma", 3, 3)];
    const out = rotateNodes(nodes, { x: 0, y: 0 }, 45);
    expect(out.map((n) => n.id)).toEqual(["alpha", "beta", "gamma"]);
  });

  it("geo coord at lat 47.9184 rotates around centroid preserving cluster shape", () => {
    const a = node("a", 0, 0, { lat: 47.9184, lon: 106.9176 });
    const b = node("b", 100, 0, { lat: 47.9184, lon: 106.92 });
    const c = node("c", 50, 100, { lat: 47.919, lon: 106.9188 });
    const nodes = [a, b, c];
    const centerGeo = centroidGeo(nodes)!;
    const centerPx = centroidPx(nodes);
    const out = rotateNodes(nodes, centerPx, 90, centerGeo);
    // Cluster shape preserved — distance between A-B should equal
    // distance between A'-B' in metres (computed via simple Haversine).
    const EARTH_R = 6_371_000;
    const M_PER_DEG = (Math.PI * EARTH_R) / 180;
    const cosLat = Math.cos((47.9184 * Math.PI) / 180);
    const distBefore = Math.hypot(
      (b.geo!.lon - a.geo!.lon) * cosLat * M_PER_DEG,
      (b.geo!.lat - a.geo!.lat) * M_PER_DEG,
    );
    const distAfter = Math.hypot(
      (out[1]!.geo!.lon - out[0]!.geo!.lon) * cosLat * M_PER_DEG,
      (out[1]!.geo!.lat - out[0]!.geo!.lat) * M_PER_DEG,
    );
    expect(distAfter).toBeCloseTo(distBefore, 0);
  });

  it("snap-angle simulation: 45° rotation lands inside pixel tolerance", () => {
    // (100, 0) rotated 45° CCW = (100·cos45°, 100·sin45°) = (~70.71, ~70.71).
    // Math.round() in the implementation snaps to integer pixels — so
    // we expect ±0.5 px from the analytical value. Larger coordinates
    // dilute the rounding effect; (1, 0) would round to (1, 1) which
    // tests nothing useful.
    const out = rotateNodes([node("a", 100, 0)], { x: 0, y: 0 }, 45);
    expect(out[0]!.x).toBe(71); // rounded from 70.71
    expect(out[0]!.y).toBe(71);
    // Sanity: the rounded point is within 1 px of the analytical
    // location — proves the transform is exact, only storage rounds.
    const exact = 100 * Math.SQRT1_2;
    expect(Math.abs(out[0]!.x - exact)).toBeLessThan(1);
    expect(Math.abs(out[0]!.y - exact)).toBeLessThan(1);
  });
});

describe("mirrorNodes — Phase 6.5.3", () => {
  it("mirror horizontal across y=10: (5, 5) → (5, 15)", () => {
    const out = mirrorNodes([node("a", 5, 5)], { kind: "horizontal", y_px: 10 });
    expect(out[0]!.x).toBe(5);
    expect(out[0]!.y).toBe(15);
  });

  it("mirror vertical across x=10: (5, 5) → (15, 5)", () => {
    const out = mirrorNodes([node("a", 5, 5)], { kind: "vertical", x_px: 10 });
    expect(out[0]!.x).toBe(15);
    expect(out[0]!.y).toBe(5);
  });

  it("mirror across diagonal y=x line: (1, 0) → (0, 1)", () => {
    const out = mirrorNodes([node("a", 1, 0)], {
      kind: "line",
      a_px: { x: 0, y: 0 },
      b_px: { x: 1, y: 1 },
    });
    expect(out[0]!.x).toBeCloseTo(0, 5);
    expect(out[0]!.y).toBeCloseTo(1, 5);
  });

  it("mirror preserves IDs and other fields", () => {
    const a: SchemeNode = {
      id: "src", kind: "source_substation", label: "S",
      x: 5, y: 5, heatLoad_w: 10_000,
    };
    const out = mirrorNodes([a], { kind: "horizontal", y_px: 10 });
    expect(out[0]!.id).toBe("src");
    expect(out[0]!.kind).toBe("source_substation");
    expect(out[0]!.label).toBe("S");
    expect(out[0]!.heatLoad_w).toBe(10_000);
  });

  it("horizontal mirror updates geo.lat when y_geo_lat provided", () => {
    const a = node("a", 5, 5, { lat: 47.9184, lon: 106.9176 });
    const out = mirrorNodes([a], { kind: "horizontal", y_px: 10, y_geo_lat: 47.92 });
    // lat reflected across 47.92: new_lat = 2*47.92 - 47.9184 = 47.9216
    expect(out[0]!.geo!.lat).toBeCloseTo(47.9216, 5);
    expect(out[0]!.geo!.lon).toBe(106.9176);
  });

  it("vertical mirror updates geo.lon when x_geo_lon provided", () => {
    const a = node("a", 5, 5, { lat: 47.9184, lon: 106.9176 });
    const out = mirrorNodes([a], { kind: "vertical", x_px: 10, x_geo_lon: 106.92 });
    expect(out[0]!.geo!.lat).toBe(47.9184);
    expect(out[0]!.geo!.lon).toBeCloseTo(106.9224, 5);
  });

  it("degenerate 2-point line (a==b) returns the input unchanged", () => {
    const a = node("a", 5, 5);
    const out = mirrorNodes([a], {
      kind: "line",
      a_px: { x: 1, y: 1 },
      b_px: { x: 1, y: 1 },
    });
    expect(out[0]!.x).toBe(5);
    expect(out[0]!.y).toBe(5);
  });
});

describe("centroidPx / centroidGeo — Phase 6.5.3 helpers", () => {
  it("centroidPx returns the arithmetic mean of x and y", () => {
    const c = centroidPx([node("a", 0, 0), node("b", 100, 0), node("c", 0, 100)]);
    expect(c.x).toBeCloseTo(33.33, 1);
    expect(c.y).toBeCloseTo(33.33, 1);
  });

  it("centroidPx of empty input returns origin", () => {
    expect(centroidPx([])).toEqual({ x: 0, y: 0 });
  });

  it("centroidGeo returns the mean of lat / lon across geo nodes only", () => {
    const nodes = [
      node("a", 0, 0, { lat: 47.9, lon: 106.9 }),
      node("b", 0, 0, { lat: 48.0, lon: 107.0 }),
      node("c", 0, 0), // no geo — skipped
    ];
    const c = centroidGeo(nodes);
    expect(c).not.toBeNull();
    expect(c!.lat).toBeCloseTo(47.95, 5);
    expect(c!.lon).toBeCloseTo(106.95, 5);
  });

  it("centroidGeo returns null when no node carries geo", () => {
    expect(centroidGeo([node("a", 0, 0), node("b", 100, 100)])).toBeNull();
  });
});

describe("Engineering invariants — Phase 6.5.3", () => {
  it("translate+rotate inverse composition restores original position", () => {
    // The inverse of [translate(d) ∘ rotate(θ)] is
    // [rotate(-θ) ∘ translate(-d)] — applied in that order, we get
    // back to the start (within ±1 px per Math.round step).
    const nodes = [node("a", 50, 50), node("b", 80, 20)];
    let out = translateNodes(nodes, { x: 10, y: 20 });
    out = rotateNodes(out, { x: 50, y: 50 }, 90);
    // Apply inverse: rotate(-90) then translate(-10, -20).
    out = rotateNodes(out, { x: 50, y: 50 }, -90);
    out = translateNodes(out, { x: -10, y: -20 });
    expect(Math.abs(out[0]!.x - 50)).toBeLessThanOrEqual(2);
    expect(Math.abs(out[0]!.y - 50)).toBeLessThanOrEqual(2);
    expect(Math.abs(out[1]!.x - 80)).toBeLessThanOrEqual(2);
    expect(Math.abs(out[1]!.y - 20)).toBeLessThanOrEqual(2);
  });

  it("transformations preserve node count (no orphaning, no duplication)", () => {
    const nodes = Array.from({ length: 10 }, (_, i) => node(`n${i}`, i * 10, i * 5));
    expect(translateNodes(nodes, { x: 1, y: 1 })).toHaveLength(10);
    expect(rotateNodes(nodes, { x: 0, y: 0 }, 45)).toHaveLength(10);
    expect(mirrorNodes(nodes, { kind: "horizontal", y_px: 50 })).toHaveLength(10);
  });
});
