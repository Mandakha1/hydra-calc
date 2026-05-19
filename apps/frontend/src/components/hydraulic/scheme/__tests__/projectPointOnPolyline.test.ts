/**
 * Phase 13.24 — Project click point onto polyline tests.
 */
import { describe, it, expect } from "vitest";
import { projectPointOnPolyline } from "../projectPointOnPolyline";

describe("projectPointOnPolyline — Phase 13.24", () => {
  it("click exactly on the polyline midpoint → t ≈ 0.5", () => {
    const result = projectPointOnPolyline(
      { x: 50, y: 0 },
      [{ x: 0, y: 0 }, { x: 100, y: 0 }],
    );
    expect(result).not.toBeNull();
    expect(result!.t).toBeCloseTo(0.5, 5);
    expect(result!.distance).toBeCloseTo(0, 5);
    expect(result!.segmentIndex).toBe(0);
  });

  it("click off the line — perpendicular projection back to line", () => {
    // Click at (25, 50) above a horizontal line (0,0)→(100,0).
    // Projection lands at (25, 0), t = 25/100 = 0.25.
    const result = projectPointOnPolyline(
      { x: 25, y: 50 },
      [{ x: 0, y: 0 }, { x: 100, y: 0 }],
    );
    expect(result!.t).toBeCloseTo(0.25, 5);
    expect(result!.point.x).toBeCloseTo(25, 5);
    expect(result!.point.y).toBeCloseTo(0, 5);
    expect(result!.distance).toBeCloseTo(50, 5);
  });

  it("click beyond the segment end clamps to the endpoint (t = 1)", () => {
    // Click at (200, 0) — beyond (100, 0). u clamps to 1, t = 1.
    const result = projectPointOnPolyline(
      { x: 200, y: 0 },
      [{ x: 0, y: 0 }, { x: 100, y: 0 }],
    );
    expect(result!.t).toBeCloseTo(1, 5);
    expect(result!.point.x).toBeCloseTo(100, 5);
  });

  it("click before the segment start clamps to t = 0", () => {
    const result = projectPointOnPolyline(
      { x: -50, y: 0 },
      [{ x: 0, y: 0 }, { x: 100, y: 0 }],
    );
    expect(result!.t).toBeCloseTo(0, 5);
    expect(result!.point.x).toBeCloseTo(0, 5);
  });

  it("L-shape: click near the bend lands on the closer segment", () => {
    // Polyline (0,0)→(50,0)→(50,50). Click at (50, 25) — exactly on
    // segment 2 midpoint. Total len = 100. Acc through seg 1 = 50,
    // u in seg 2 = 25/50 = 0.5 → t = (50 + 25)/100 = 0.75.
    const result = projectPointOnPolyline(
      { x: 50, y: 25 },
      [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 50 }],
    );
    expect(result!.t).toBeCloseTo(0.75, 4);
    expect(result!.point.x).toBeCloseTo(50, 4);
    expect(result!.point.y).toBeCloseTo(25, 4);
    expect(result!.segmentIndex).toBe(1);
  });

  it("L-shape: click in the middle of the first segment → seg 0, t = 0.25", () => {
    // Click at (25, 5) — almost on segment 1 quarter.
    // Total len = 100, seg 1 mid = 25, t = 25/100 = 0.25.
    const result = projectPointOnPolyline(
      { x: 25, y: 5 },
      [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 50 }],
    );
    expect(result!.t).toBeCloseTo(0.25, 3);
    expect(result!.segmentIndex).toBe(0);
  });

  it("L-shape: click outside-but-closest-to second segment → seg 1", () => {
    // Click at (80, 30) — beyond seg 2's x=50, closer perpendicular
    // distance to seg 2 than seg 1.
    const result = projectPointOnPolyline(
      { x: 80, y: 30 },
      [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 50 }],
    );
    expect(result!.segmentIndex).toBe(1);
    expect(result!.point.x).toBeCloseTo(50, 4);
    expect(result!.point.y).toBeCloseTo(30, 4);
  });

  it("returns null when polyline has fewer than 2 points", () => {
    expect(projectPointOnPolyline({ x: 0, y: 0 }, [])).toBeNull();
    expect(projectPointOnPolyline({ x: 0, y: 0 }, [{ x: 5, y: 5 }])).toBeNull();
  });

  it("degenerate zero-length polyline returns midpoint t with distance from click", () => {
    const result = projectPointOnPolyline(
      { x: 10, y: 10 },
      [{ x: 5, y: 5 }, { x: 5, y: 5 }],
    );
    expect(result!.t).toBe(0.5);
    expect(result!.point.x).toBe(5);
    expect(result!.point.y).toBe(5);
    expect(result!.distance).toBeCloseTo(Math.hypot(5, 5), 5);
  });

  it("engineer scenario: cursor halfway between source and consumer on map-projected polyline", () => {
    // Simulate a pipe rendered at (200, 50) → (300, 50) after the
    // engineer panned the map. The engineer right-clicks at (250, 50)
    // wanting to split exactly there. Helper returns t = 0.5 against
    // the DISPLAYED polyline regardless of stored x/y.
    const result = projectPointOnPolyline(
      { x: 250, y: 50 },
      [{ x: 200, y: 50 }, { x: 300, y: 50 }],
    );
    expect(result!.t).toBeCloseTo(0.5, 5);
    expect(result!.point).toEqual({ x: 250, y: 50 });
  });

  it("engineer scenario: cursor near the start of a 60 m pipe → t < 0.2 (camera at 10m)", () => {
    // Pipe (0,0)→(600,0) — 600 px = 60 m at 10 px/m. Engineer
    // right-clicks at (100, 5) wanting a camera ~10 m from start.
    // Projection: u = 100/600 = 0.167, t = 0.167.
    const result = projectPointOnPolyline(
      { x: 100, y: 5 },
      [{ x: 0, y: 0 }, { x: 600, y: 0 }],
    );
    expect(result!.t).toBeCloseTo(100 / 600, 4);
    expect(result!.t).toBeLessThan(0.2);
  });
});
