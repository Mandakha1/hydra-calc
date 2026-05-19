/**
 * Phase 13.21 — Pipe split math tests.
 *
 * Backs the right-click "Худаг / Шалгах камер байрлуулах" workflow:
 * given a target fraction t ∈ [0,1] along the pipe polyline, split
 * into two pipes with the chamber node at the interpolated point.
 *
 * Standards backing the test scenarios:
 *   • СНиП 41-02-2003 §9.6.10 — Russian heat-net chamber spacing
 *   • БНбД 41-02-13 §6.3 — Mongolian equivalent (100 m magistral / 50 m service)
 */
import { describe, it, expect } from "vitest";
import {
  splitPipeAtFraction,
  defaultChamberKindForCircuit,
} from "../splitPipe";
import type { SchemePipe } from "../../hydraulicTypes";

function makePipe(overrides?: Partial<SchemePipe>): SchemePipe {
  return {
    id: "p1",
    fromNodeId: "a",
    toNodeId: "b",
    materialKey: "steel_aged",
    dn: 100,
    length_m: 100,
    circuit: "heating_supply",
    ...overrides,
  };
}

describe("splitPipeAtFraction — Phase 13.21", () => {
  it("straight pipe split at 0.5 → midpoint, lengths halved", () => {
    const s = splitPipeAtFraction({
      pipe: makePipe({ length_m: 100 }),
      from: { x: 0, y: 0 },
      to: { x: 100, y: 0 },
      t: 0.5,
    });
    expect(s.point.x).toBeCloseTo(50, 1);
    expect(s.point.y).toBeCloseTo(0, 1);
    expect(s.lengthFirst_m).toBe(50);
    expect(s.lengthSecond_m).toBe(50);
    expect(s.bendsBefore).toHaveLength(0);
    expect(s.bendsAfter).toHaveLength(0);
  });

  it("straight pipe split at t=0.25 → quarter point", () => {
    const s = splitPipeAtFraction({
      pipe: makePipe({ length_m: 80 }),
      from: { x: 0, y: 0 },
      to: { x: 100, y: 0 },
      t: 0.25,
    });
    expect(s.point.x).toBeCloseTo(25, 1);
    expect(s.lengthFirst_m).toBe(20);
    expect(s.lengthSecond_m).toBe(60);
  });

  it("L-shaped pipe (1 bend) — split at t=0.5 with equal-length legs lands AT the bend", () => {
    // Polyline: (0,0) → (50,0) → (50,50). Total = 100 px. t=0.5 → 50 px.
    // First leg = 50 px (whole first segment) → split lands exactly on bend.
    const s = splitPipeAtFraction({
      pipe: makePipe({
        length_m: 100,
        bendPoints: [{ x: 50, y: 0 }],
      }),
      from: { x: 0, y: 0 },
      to: { x: 50, y: 50 },
      t: 0.5,
    });
    expect(s.point.x).toBeCloseTo(50, 1);
    expect(s.point.y).toBeCloseTo(0, 1);
    // Before: 0 bends (split absorbs the bend into the new junction)
    // After: 0 bends (the bend was the split point; the second pipe
    // goes straight from chamber → to-node)
    expect(s.bendsBefore).toHaveLength(0);
    expect(s.bendsAfter).toHaveLength(0);
  });

  it("L-shaped pipe — split at t=0.25 (first leg only) leaves the bend in bendsAfter", () => {
    // t=0.25 of 100 px = 25 px → mid of first segment (0,0)→(50,0)
    const s = splitPipeAtFraction({
      pipe: makePipe({
        length_m: 100,
        bendPoints: [{ x: 50, y: 0 }],
      }),
      from: { x: 0, y: 0 },
      to: { x: 50, y: 50 },
      t: 0.25,
    });
    expect(s.point.x).toBeCloseTo(25, 1);
    expect(s.point.y).toBeCloseTo(0, 1);
    expect(s.bendsBefore).toHaveLength(0);
    // The (50,0) bend lives on the second pipe after the chamber.
    expect(s.bendsAfter).toHaveLength(1);
    expect(s.bendsAfter[0]!.x).toBe(50);
  });

  it("L-shaped pipe — split at t=0.75 (second leg) leaves bend in bendsBefore", () => {
    const s = splitPipeAtFraction({
      pipe: makePipe({
        length_m: 100,
        bendPoints: [{ x: 50, y: 0 }],
      }),
      from: { x: 0, y: 0 },
      to: { x: 50, y: 50 },
      t: 0.75,
    });
    // 75 px → first seg 50 + 25 into second seg → (50, 25)
    expect(s.point.x).toBeCloseTo(50, 1);
    expect(s.point.y).toBeCloseTo(25, 1);
    expect(s.bendsBefore).toHaveLength(1);
    expect(s.bendsBefore[0]!.y).toBe(0);
    expect(s.bendsAfter).toHaveLength(0);
  });

  it("clamps t to [0.01, 0.99] so neither sub-pipe is zero-length", () => {
    const a = splitPipeAtFraction({
      pipe: makePipe({ length_m: 100 }),
      from: { x: 0, y: 0 },
      to: { x: 100, y: 0 },
      t: 0, // clamped to 0.01
    });
    expect(a.lengthFirst_m).toBeGreaterThanOrEqual(0.5);
    expect(a.lengthSecond_m).toBeGreaterThanOrEqual(0.5);
    const b = splitPipeAtFraction({
      pipe: makePipe({ length_m: 100 }),
      from: { x: 0, y: 0 },
      to: { x: 100, y: 0 },
      t: 1, // clamped to 0.99
    });
    expect(b.lengthFirst_m).toBeGreaterThanOrEqual(0.5);
    expect(b.lengthSecond_m).toBeGreaterThanOrEqual(0.5);
  });

  it("preserves Phase 12.3 length_m authoritative invariant — sub-lengths sum to original", () => {
    const s = splitPipeAtFraction({
      pipe: makePipe({ length_m: 80 }),
      from: { x: 0, y: 0 },
      to: { x: 100, y: 0 },
      t: 0.3,
    });
    expect(s.lengthFirst_m + s.lengthSecond_m).toBeCloseTo(80, 1);
  });

  it("interpolates lat/lon when both endpoints carry geo (heat trench on map)", () => {
    const s = splitPipeAtFraction({
      pipe: makePipe({ length_m: 100 }),
      from: { x: 0, y: 0, lat: 47.918, lon: 106.917 },
      to: { x: 100, y: 0, lat: 47.920, lon: 106.917 },
      t: 0.5,
    });
    expect(s.point.lat).toBeCloseTo(47.919, 3);
    expect(s.point.lon).toBeCloseTo(106.917, 3);
  });

  it("skips lat/lon when only one endpoint carries geo", () => {
    const s = splitPipeAtFraction({
      pipe: makePipe(),
      from: { x: 0, y: 0, lat: 47.918, lon: 106.917 },
      to: { x: 100, y: 0 }, // no geo
      t: 0.5,
    });
    expect(s.point.lat).toBeUndefined();
    expect(s.point.lon).toBeUndefined();
  });

  it("zero-length polyline → degenerate fallback (no NaN propagation)", () => {
    const s = splitPipeAtFraction({
      pipe: makePipe({ length_m: 10 }),
      from: { x: 50, y: 50 },
      to: { x: 50, y: 50 },
      t: 0.5,
    });
    expect(s.point.x).toBe(50);
    expect(s.lengthFirst_m).toBe(5);
    expect(s.lengthSecond_m).toBe(5);
  });
});

describe("defaultChamberKindForCircuit — Phase 13.21", () => {
  it("cold-water pipes → well_supply (хүйтэн усны шалгах худаг per БНбД 40-05)", () => {
    expect(defaultChamberKindForCircuit("cold_water")).toBe("well_supply");
  });

  it("heat circuits → chamber (камер per БНбД 41-02-13 §6.3 / СНиП 41-02-2003 §9.6.10)", () => {
    expect(defaultChamberKindForCircuit("heating_supply")).toBe("chamber");
    expect(defaultChamberKindForCircuit("heating_return")).toBe("chamber");
    expect(defaultChamberKindForCircuit("dhw_supply")).toBe("chamber");
    expect(defaultChamberKindForCircuit("dhw_recirc")).toBe("chamber");
  });

  it("undefined circuit defaults to chamber (no special branch)", () => {
    expect(defaultChamberKindForCircuit(undefined)).toBe("chamber");
  });
});
