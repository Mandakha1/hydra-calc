/**
 * Phase 13.20 — Parallel pipe offset math tests.
 *
 * Engineer report: "Жижиг барилга дээр давхарлаж зурхад алдаа их гарч
 * цэгүүд зөрж байна." Multi-circuit pipes (Phase 13.18 Mouse-2 picker)
 * were rendering on top of each other when the engineer drew Т1+Т2+Т3
 * +Т4 between two buildings; this helper computes the per-pipe
 * offset index that the renderer uses to fan them out perpendicularly.
 */
import { describe, it, expect } from "vitest";
import {
  computeParallelOffsets,
  perpendicularUnit,
  offsetPolyline,
  DEFAULT_PARALLEL_SPACING_PX,
} from "../parallelPipeOffset";
import type { SchemePipe } from "../../hydraulicTypes";

function makePipe(id: string, from: string, to: string, circuit: SchemePipe["circuit"]): SchemePipe {
  return {
    id,
    fromNodeId: from,
    toNodeId: to,
    circuit,
    materialKey: "steel_aged",
    dn: 50,
    length_m: 10,
  };
}

describe("computeParallelOffsets — Phase 13.20", () => {
  it("singleton pipe gets offset = 0 (no shift)", () => {
    const offsets = computeParallelOffsets([makePipe("p1", "a", "b", "heating_supply")]);
    expect(offsets.get("p1")).toBe(0);
  });

  it("two pipes between same endpoints → centred offsets (-0.5, +0.5)", () => {
    const offsets = computeParallelOffsets([
      makePipe("p1", "a", "b", "heating_supply"),
      makePipe("p2", "a", "b", "heating_return"),
    ]);
    expect(offsets.get("p1")).toBe(-0.5);
    expect(offsets.get("p2")).toBe(0.5);
  });

  it("five pipes (Т1..В1) → centred offsets [-2, -1, 0, +1, +2]", () => {
    const offsets = computeParallelOffsets([
      makePipe("p1", "a", "b", "heating_supply"),
      makePipe("p2", "a", "b", "heating_return"),
      makePipe("p3", "a", "b", "dhw_supply"),
      makePipe("p4", "a", "b", "dhw_recirc"),
      makePipe("p5", "a", "b", "cold_water"),
    ]);
    expect(offsets.get("p1")).toBe(-2);
    expect(offsets.get("p2")).toBe(-1);
    expect(offsets.get("p3")).toBe(0);
    expect(offsets.get("p4")).toBe(1);
    expect(offsets.get("p5")).toBe(2);
  });

  it("offsets are direction-invariant — (a→b) and (b→a) share a group", () => {
    const offsets = computeParallelOffsets([
      makePipe("p1", "a", "b", "heating_supply"), // a → b
      makePipe("p2", "b", "a", "heating_return"), // b → a (return)
    ]);
    // Both should get the centred N=2 offsets, not separate groups.
    expect(offsets.get("p1")).toBe(-0.5);
    expect(offsets.get("p2")).toBe(0.5);
  });

  it("groups order by canonical circuit, not insertion order", () => {
    const offsets = computeParallelOffsets([
      makePipe("p_dhw", "a", "b", "dhw_supply"),       // inserted FIRST
      makePipe("p_heat", "a", "b", "heating_supply"), // inserted SECOND
    ]);
    // heating_supply has canonical order 0 < dhw_supply (2), so heat
    // gets the lower offset (-0.5) even though it was inserted last.
    expect(offsets.get("p_heat")).toBe(-0.5);
    expect(offsets.get("p_dhw")).toBe(0.5);
  });

  it("multiple endpoint pairs each get their own group", () => {
    const offsets = computeParallelOffsets([
      // Group 1: a-b (Т1 + Т2)
      makePipe("p1", "a", "b", "heating_supply"),
      makePipe("p2", "a", "b", "heating_return"),
      // Group 2: b-c (Т1 + Т2)
      makePipe("p3", "b", "c", "heating_supply"),
      makePipe("p4", "b", "c", "heating_return"),
      // Group 3: a-c singleton
      makePipe("p5", "a", "c", "cold_water"),
    ]);
    expect(offsets.get("p1")).toBe(-0.5);
    expect(offsets.get("p2")).toBe(0.5);
    expect(offsets.get("p3")).toBe(-0.5);
    expect(offsets.get("p4")).toBe(0.5);
    expect(offsets.get("p5")).toBe(0); // singleton
  });

  it("channelId pipes are excluded from offset grouping (rendered by channel)", () => {
    // Phase 12.5 composite channels paint ONE thick polyline that
    // already represents the trench; their constituent pipes must NOT
    // get a parallel fan-out (that would double-render them).
    const channelPipe: SchemePipe = {
      ...makePipe("ch_p1", "a", "b", "heating_supply"),
      channelId: "ch1",
    };
    const standalonePipe = makePipe("p2", "a", "b", "heating_return");
    const offsets = computeParallelOffsets([channelPipe, standalonePipe]);
    // ch_p1 excluded → p2 is now a singleton → offset 0
    expect(offsets.has("ch_p1")).toBe(false);
    expect(offsets.get("p2")).toBe(0);
  });

  it("ties on circuit order broken by id (stable layout for engineer-extended circuits)", () => {
    const offsets = computeParallelOffsets([
      makePipe("zzz", "a", "b", "heating_supply"),
      makePipe("aaa", "a", "b", "heating_supply"),
    ]);
    // Both are heating_supply → tie-break by id, so "aaa" < "zzz".
    expect(offsets.get("aaa")).toBe(-0.5);
    expect(offsets.get("zzz")).toBe(0.5);
  });
});

describe("perpendicularUnit — Phase 13.20", () => {
  it("horizontal segment → vertical perpendicular", () => {
    const p = perpendicularUnit({ x: 0, y: 0 }, { x: 100, y: 0 });
    expect(p.x).toBeCloseTo(0, 5);
    expect(p.y).toBeCloseTo(1, 5);
  });

  it("vertical segment → horizontal perpendicular", () => {
    const p = perpendicularUnit({ x: 0, y: 0 }, { x: 0, y: 100 });
    expect(p.x).toBeCloseTo(-1, 5);
    expect(p.y).toBeCloseTo(0, 5);
  });

  it("45° segment → unit perpendicular at 135°", () => {
    const p = perpendicularUnit({ x: 0, y: 0 }, { x: 70.71, y: 70.71 });
    expect(p.x).toBeCloseTo(-0.7071, 3);
    expect(p.y).toBeCloseTo(0.7071, 3);
    expect(Math.hypot(p.x, p.y)).toBeCloseTo(1, 5);
  });

  it("zero-length segment → zero vector (no shift fallback)", () => {
    const p = perpendicularUnit({ x: 50, y: 50 }, { x: 50, y: 50 });
    expect(p).toEqual({ x: 0, y: 0 });
  });
});

describe("offsetPolyline — Phase 13.20", () => {
  it("returns identical points when offset = 0", () => {
    const pts = [{ x: 0, y: 0 }, { x: 100, y: 0 }];
    const out = offsetPolyline(pts, 0);
    expect(out).toEqual(pts);
  });

  it("horizontal pipe + offset = +1 → shifted DOWN by spacing px", () => {
    // For (0,0)→(100,0), perp = (0,1). offset = +1 × 4 px = +4 → (x, y+4)
    const out = offsetPolyline([{ x: 0, y: 0 }, { x: 100, y: 0 }], 1);
    expect(out[0]!.y).toBeCloseTo(DEFAULT_PARALLEL_SPACING_PX, 5);
    expect(out[1]!.y).toBeCloseTo(DEFAULT_PARALLEL_SPACING_PX, 5);
  });

  it("horizontal pipe + offset = -1 → shifted UP", () => {
    const out = offsetPolyline([{ x: 0, y: 0 }, { x: 100, y: 0 }], -1);
    expect(out[0]!.y).toBeCloseTo(-DEFAULT_PARALLEL_SPACING_PX, 5);
  });

  it("vertical pipe + offset → shifted LEFT (perp = (-1, 0))", () => {
    const out = offsetPolyline([{ x: 50, y: 0 }, { x: 50, y: 100 }], 1);
    expect(out[0]!.x).toBeCloseTo(50 - DEFAULT_PARALLEL_SPACING_PX, 5);
  });

  it("polyline with bends → all points shifted by SAME perpendicular (rigid body)", () => {
    // Engineer draws an L-shape pipe. We want the offset polyline to
    // shift the WHOLE polyline together (rigid). The perpendicular is
    // computed from first→last, not segment-by-segment.
    const out = offsetPolyline(
      [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 50 }],
      1,
    );
    // First→last = (0,0) → (50,50). Perp = (-50, 50)/√5000 = (-0.707, 0.707)
    // Shift = 4 × (-0.707, 0.707) = (-2.83, 2.83). All three points
    // get the SAME shift.
    expect(out[0]!.x).toBeCloseTo(-2.83, 1);
    expect(out[0]!.y).toBeCloseTo(2.83, 1);
    expect(out[1]!.x).toBeCloseTo(47.17, 1);
    expect(out[1]!.y).toBeCloseTo(2.83, 1);
    expect(out[2]!.x).toBeCloseTo(47.17, 1);
    expect(out[2]!.y).toBeCloseTo(52.83, 1);
  });

  it("custom spacing argument overrides default", () => {
    const out = offsetPolyline([{ x: 0, y: 0 }, { x: 100, y: 0 }], 2, 10);
    // offset = 2 × 10 = 20 px down (perp = (0,1))
    expect(out[0]!.y).toBeCloseTo(20, 5);
  });

  it("zero-length segment → returns points unchanged (no NaN propagation)", () => {
    const out = offsetPolyline([{ x: 50, y: 50 }, { x: 50, y: 50 }], 1);
    expect(out).toEqual([{ x: 50, y: 50 }, { x: 50, y: 50 }]);
  });
});

describe("integration — Phase 13.20 + engineer scenario", () => {
  it("5-circuit trench between small buildings: visible spacing across 16 px", () => {
    // Engineer's Phase 13.18 multi-circuit flow: Т1+Т2+Т3+Т4+В1.
    // Two small buildings centred at (0,0) and (100,0). Without
    // offset all 5 pipes would render at y=0. With offset, they fan
    // out across ±2 × 4 px = ±8 px (16-px total visible spread).
    const pipes: SchemePipe[] = [
      makePipe("p1", "a", "b", "heating_supply"),
      makePipe("p2", "a", "b", "heating_return"),
      makePipe("p3", "a", "b", "dhw_supply"),
      makePipe("p4", "a", "b", "dhw_recirc"),
      makePipe("p5", "a", "b", "cold_water"),
    ];
    const offsets = computeParallelOffsets(pipes);
    const ys: number[] = [];
    for (const p of pipes) {
      const shifted = offsetPolyline(
        [{ x: 0, y: 0 }, { x: 100, y: 0 }],
        offsets.get(p.id) ?? 0,
      );
      ys.push(shifted[0]!.y);
    }
    // 5 unique y values, sorted, spaced by 4 px:
    ys.sort((a, b) => a - b);
    expect(ys).toEqual([-8, -4, 0, 4, 8]);
  });
});
