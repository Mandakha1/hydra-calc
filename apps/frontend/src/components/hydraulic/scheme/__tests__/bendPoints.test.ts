/**
 * Phase 12.3 — bend-point helper tests.
 */
import { describe, it, expect } from "vitest";
import {
  resolvePipePath,
  geometryLengthPx,
  hasLengthDrift,
  snapToAnglePolicy,
  findBendInsertionIndex,
  addBendPoint,
  removeBendPoint,
  moveBendPoint,
  bendDeflectionDeg,
  bendOutwardBisector,
} from "../bendPoints";
import type { SchemePipe, SchemeNode } from "../../hydraulicTypes";

const NODE_A: SchemeNode = { id: "a", kind: "junction", label: "A", x: 0, y: 0 };
const NODE_B: SchemeNode = { id: "b", kind: "junction", label: "B", x: 200, y: 0 };

function makePipe(over: Partial<SchemePipe> = {}): SchemePipe {
  return {
    id: "p1",
    fromNodeId: "a",
    toNodeId: "b",
    materialKey: "steel_aged",
    dn: 100,
    length_m: 10,
    ...over,
  };
}

/* ─── resolvePipePath ──────────────────────────────────────────── */

describe("resolvePipePath", () => {
  it("returns [from, to] when no bend points", () => {
    const path = resolvePipePath(makePipe(), NODE_A, NODE_B);
    expect(path).toHaveLength(2);
    expect(path[0]).toMatchObject({ x: 0, y: 0 });
    expect(path[1]).toMatchObject({ x: 200, y: 0 });
  });

  it("includes bendPoints in order between endpoints", () => {
    const pipe = makePipe({
      bendPoints: [
        { x: 50, y: 30 },
        { x: 150, y: 30 },
      ],
    });
    const path = resolvePipePath(pipe, NODE_A, NODE_B);
    expect(path).toHaveLength(4);
    expect(path[1]).toMatchObject({ x: 50, y: 30 });
    expect(path[2]).toMatchObject({ x: 150, y: 30 });
  });

  it("falls back to legacy waypoints when bendPoints empty", () => {
    const pipe = makePipe({ waypoints: [{ x: 100, y: 50 }] });
    const path = resolvePipePath(pipe, NODE_A, NODE_B);
    expect(path).toHaveLength(3);
    expect(path[1]).toMatchObject({ x: 100, y: 50 });
  });

  it("bendPoints wins over waypoints when both set", () => {
    const pipe = makePipe({
      bendPoints: [{ x: 50, y: 30 }],
      waypoints: [{ x: 100, y: 50 }],
    });
    const path = resolvePipePath(pipe, NODE_A, NODE_B);
    expect(path).toHaveLength(3);
    expect(path[1]).toMatchObject({ x: 50, y: 30 });
  });

  it("returns empty when nodes missing", () => {
    expect(resolvePipePath(makePipe(), null, NODE_B)).toEqual([]);
    expect(resolvePipePath(makePipe(), NODE_A, null)).toEqual([]);
  });

  it("preserves lat/lon on bend points", () => {
    const pipe = makePipe({
      bendPoints: [{ x: 50, y: 30, lat: 47.92, lon: 106.91 }],
    });
    const path = resolvePipePath(pipe, NODE_A, NODE_B);
    expect(path[1]).toMatchObject({ lat: 47.92, lon: 106.91 });
  });
});

/* ─── geometryLengthPx ─────────────────────────────────────────── */

describe("geometryLengthPx", () => {
  it("0 for < 2 points", () => {
    expect(geometryLengthPx([])).toBe(0);
    expect(geometryLengthPx([{ x: 0, y: 0 }])).toBe(0);
  });

  it("straight 2-point distance", () => {
    expect(geometryLengthPx([{ x: 0, y: 0 }, { x: 100, y: 0 }])).toBe(100);
  });

  it("polyline sum", () => {
    // 0,0 → 100,0 → 100,100 = 100 + 100 = 200
    expect(geometryLengthPx([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
    ])).toBe(200);
  });

  it("Pythagorean diagonal", () => {
    // 0,0 → 3,4 = 5
    expect(geometryLengthPx([{ x: 0, y: 0 }, { x: 3, y: 4 }])).toBe(5);
  });
});

/* ─── hasLengthDrift ───────────────────────────────────────────── */

describe("hasLengthDrift — 5% threshold", () => {
  it("returns false when geometry matches length_m", () => {
    // 200px / 20 px/m = 10 m, pipe.length_m = 10
    expect(hasLengthDrift(makePipe({ length_m: 10 }), NODE_A, NODE_B, 20)).toBe(false);
  });

  it("returns true when drift > 5%", () => {
    // 200px / 20 = 10m, but length_m = 12 → 20% drift
    expect(hasLengthDrift(makePipe({ length_m: 12 }), NODE_A, NODE_B, 20)).toBe(true);
  });

  it("returns false when drift within 5%", () => {
    // 200px = 10m, length_m = 10.3 → 3% drift
    expect(hasLengthDrift(makePipe({ length_m: 10.3 }), NODE_A, NODE_B, 20)).toBe(false);
  });

  it("returns false when length_m <= 0 (defensive)", () => {
    expect(hasLengthDrift(makePipe({ length_m: 0 }), NODE_A, NODE_B, 20)).toBe(false);
  });

  it("returns false when nodes missing", () => {
    expect(hasLengthDrift(makePipe(), null, NODE_B, 20)).toBe(false);
  });

  it("custom threshold", () => {
    // 5% drift, threshold 0.10 (10%) → no warning
    expect(hasLengthDrift(makePipe({ length_m: 10.5 }), NODE_A, NODE_B, 20, 0.10)).toBe(false);
    // 5% drift, threshold 0.03 (3%) → warning
    expect(hasLengthDrift(makePipe({ length_m: 10.5 }), NODE_A, NODE_B, 20, 0.03)).toBe(true);
  });
});

/* ─── snapToAnglePolicy ────────────────────────────────────────── */

describe("snapToAnglePolicy", () => {
  const anchor = { x: 0, y: 0 };

  it("'free' returns target unchanged", () => {
    const target = { x: 73, y: 42 };
    expect(snapToAnglePolicy(anchor, target, "free")).toEqual(target);
  });

  it("undefined policy returns target unchanged", () => {
    const target = { x: 73, y: 42 };
    expect(snapToAnglePolicy(anchor, target, undefined)).toEqual(target);
  });

  it("'snap_90' snaps 37° target to 0° (East)", () => {
    // 100 magnitude at 37° → snap to 0° East
    const target = { x: 100 * Math.cos((37 * Math.PI) / 180), y: 100 * Math.sin((37 * Math.PI) / 180) };
    const snapped = snapToAnglePolicy(anchor, target, "snap_90");
    expect(snapped.x).toBeCloseTo(100, 1);
    expect(snapped.y).toBeCloseTo(0, 1);
  });

  it("'snap_90' snaps 60° target to 90° (South in SVG)", () => {
    const target = { x: 100 * Math.cos((60 * Math.PI) / 180), y: 100 * Math.sin((60 * Math.PI) / 180) };
    const snapped = snapToAnglePolicy(anchor, target, "snap_90");
    expect(snapped.x).toBeCloseTo(0, 1);
    expect(snapped.y).toBeCloseTo(100, 1);
  });

  it("'snap_45' snaps 37° to 45°", () => {
    const target = { x: 100 * Math.cos((37 * Math.PI) / 180), y: 100 * Math.sin((37 * Math.PI) / 180) };
    const snapped = snapToAnglePolicy(anchor, target, "snap_45");
    expect(snapped.x).toBeCloseTo(100 * Math.cos(Math.PI / 4), 1);
    expect(snapped.y).toBeCloseTo(100 * Math.sin(Math.PI / 4), 1);
  });

  it("preserves magnitude", () => {
    const target = { x: 73, y: 42 };
    const snapped = snapToAnglePolicy(anchor, target, "snap_45");
    const origMag = Math.hypot(target.x, target.y);
    const snappedMag = Math.hypot(snapped.x - anchor.x, snapped.y - anchor.y);
    expect(snappedMag).toBeCloseTo(origMag, 1);
  });

  it("degenerate (target = anchor) returns target", () => {
    expect(snapToAnglePolicy(anchor, anchor, "snap_45")).toEqual(anchor);
  });
});

/* ─── findBendInsertionIndex + addBendPoint ────────────────────── */

describe("findBendInsertionIndex", () => {
  it("returns 0 for click near first segment", () => {
    // Pipe from (0,0) to (200,0), click at (50, 5)
    const idx = findBendInsertionIndex(makePipe(), NODE_A, NODE_B, { x: 50, y: 5 });
    expect(idx).toBe(0);
  });

  it("returns 1 for click between two existing bend points", () => {
    const pipe = makePipe({
      bendPoints: [{ x: 100, y: 0 }],
    });
    // Path is [A(0,0), bp(100,0), B(200,0)]. Click at (150, 0) is on the SECOND segment.
    const idx = findBendInsertionIndex(pipe, NODE_A, NODE_B, { x: 150, y: 0 });
    expect(idx).toBe(1);
  });
});

describe("addBendPoint", () => {
  it("inserts at the correct index", () => {
    const pipe = makePipe();
    const newBendPoints = addBendPoint(pipe, NODE_A, NODE_B, { x: 100, y: 30 });
    expect(newBendPoints).toHaveLength(1);
    expect(newBendPoints[0]).toMatchObject({ x: 100, y: 30 });
  });

  it("preserves existing bend points", () => {
    const pipe = makePipe({
      bendPoints: [{ x: 50, y: 0 }, { x: 150, y: 0 }],
    });
    const newBendPoints = addBendPoint(pipe, NODE_A, NODE_B, { x: 100, y: 30 });
    expect(newBendPoints).toHaveLength(3);
    expect(newBendPoints[1]).toMatchObject({ x: 100, y: 30 });
  });

  it("preserves lat/lon", () => {
    const pipe = makePipe();
    const newBendPoints = addBendPoint(pipe, NODE_A, NODE_B, {
      x: 100, y: 30, lat: 47.92, lon: 106.91,
    });
    expect(newBendPoints[0]).toMatchObject({ lat: 47.92, lon: 106.91 });
  });
});

/* ─── removeBendPoint ──────────────────────────────────────────── */

describe("removeBendPoint", () => {
  it("removes the bend point at given index", () => {
    const pipe = makePipe({
      bendPoints: [{ x: 50, y: 0 }, { x: 100, y: 30 }, { x: 150, y: 0 }],
    });
    const result = removeBendPoint(pipe, 1);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ x: 50, y: 0 });
    expect(result[1]).toMatchObject({ x: 150, y: 0 });
  });

  it("returns same array if index out of range", () => {
    const pipe = makePipe({ bendPoints: [{ x: 100, y: 0 }] });
    expect(removeBendPoint(pipe, 99)).toEqual(pipe.bendPoints);
    expect(removeBendPoint(pipe, -1)).toEqual(pipe.bendPoints);
  });

  it("returns empty array when removing only bend point", () => {
    const pipe = makePipe({ bendPoints: [{ x: 100, y: 0 }] });
    expect(removeBendPoint(pipe, 0)).toEqual([]);
  });
});

/* ─── moveBendPoint ────────────────────────────────────────────── */

describe("moveBendPoint", () => {
  it("updates position of bend point at index", () => {
    const pipe = makePipe({
      bendPoints: [{ x: 50, y: 0 }, { x: 100, y: 0 }],
    });
    const result = moveBendPoint(pipe, 1, { x: 100, y: 50 });
    expect(result[0]).toMatchObject({ x: 50, y: 0 });
    expect(result[1]).toMatchObject({ x: 100, y: 50 });
  });

  it("preserves lat/lon when provided", () => {
    const pipe = makePipe({
      bendPoints: [{ x: 50, y: 0 }],
    });
    const result = moveBendPoint(pipe, 0, { x: 75, y: 25, lat: 48, lon: 107 });
    expect(result[0]).toMatchObject({ lat: 48, lon: 107 });
  });

  it("returns same array if index out of range", () => {
    const pipe = makePipe({ bendPoints: [{ x: 100, y: 0 }] });
    expect(moveBendPoint(pipe, 99, { x: 0, y: 0 })).toEqual(pipe.bendPoints);
  });
});

/* ─── bendDeflectionDeg (Phase 13.39) ──────────────────────────── */

describe("bendDeflectionDeg — Phase 13.39", () => {
  it("returns 0 for a straight line (collinear points)", () => {
    const d = bendDeflectionDeg({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 200, y: 0 });
    expect(d).toBeCloseTo(0, 5);
  });

  it("returns 90 for a right-angle turn", () => {
    // East 100 → then turn → North 100
    const d = bendDeflectionDeg({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 });
    expect(d).toBeCloseTo(90, 4);
  });

  it("returns 45 for a 45° bend", () => {
    // East 100 → then turn → NE 100 (deflection 45°)
    const d = bendDeflectionDeg({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 200, y: 100 });
    expect(d).toBeCloseTo(45, 4);
  });

  it("returns 180 for a U-turn (folds back)", () => {
    // East 100 → then turn → West 100
    const d = bendDeflectionDeg({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 0 });
    expect(d).toBeCloseTo(180, 4);
  });

  it("returns 0 for degenerate input (zero-length segment)", () => {
    // Three coincident points
    const d = bendDeflectionDeg({ x: 50, y: 50 }, { x: 50, y: 50 }, { x: 50, y: 50 });
    expect(d).toBe(0);
  });

  it("is direction-invariant — reversing the polyline gives the same angle", () => {
    const forward = bendDeflectionDeg(
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
    );
    const reverse = bendDeflectionDeg(
      { x: 100, y: 100 },
      { x: 100, y: 0 },
      { x: 0, y: 0 },
    );
    expect(reverse).toBeCloseTo(forward, 5);
  });
});

/* ─── bendOutwardBisector (Phase 13.39) ────────────────────────── */

describe("bendOutwardBisector — Phase 13.39", () => {
  it("points into the convex corner for a right-angle turn east→north", () => {
    // Pipe enters going east, leaves going north. Convex side is SOUTH-EAST.
    const b = bendOutwardBisector(
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
    );
    expect(b.x).toBeCloseTo(-Math.SQRT1_2, 4);
    expect(b.y).toBeCloseTo(-Math.SQRT1_2, 4);
  });

  it("returns (0, 0) for a straight pipe (no real bend)", () => {
    const b = bendOutwardBisector({ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 100, y: 0 });
    expect(b).toEqual({ x: 0, y: 0 });
  });

  it("returns (0, 0) for degenerate / zero-length input", () => {
    const b = bendOutwardBisector({ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 100, y: 0 });
    expect(b).toEqual({ x: 0, y: 0 });
  });

  it("returns a unit-length vector for any real bend", () => {
    const b = bendOutwardBisector(
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 200, y: 100 },
    );
    expect(Math.hypot(b.x, b.y)).toBeCloseTo(1, 4);
  });
});

/* ─── Backward compat ──────────────────────────────────────────── */

describe("Backward compatibility with Phase 6 waypoints", () => {
  it("pipe with only legacy waypoints still resolves correctly", () => {
    const pipe = makePipe({ waypoints: [{ x: 75, y: 0 }, { x: 125, y: 0 }] });
    const path = resolvePipePath(pipe, NODE_A, NODE_B);
    expect(path).toHaveLength(4);
    expect(path[1]).toMatchObject({ x: 75, y: 0 });
    expect(path[2]).toMatchObject({ x: 125, y: 0 });
  });

  it("legacy pipe with neither field renders as straight line", () => {
    const path = resolvePipePath(makePipe(), NODE_A, NODE_B);
    expect(path).toHaveLength(2);
  });
});
