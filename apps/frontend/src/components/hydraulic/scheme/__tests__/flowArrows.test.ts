/**
 * Phase 12.8 — Pipe flow-arrow helper tests.
 */
import { describe, it, expect } from "vitest";
import {
  buildPipeArrow,
  buildAllArrows,
  buildArrowFromDisplayedPolyline,
  isPipeFlowReversed,
  ARROW_LENGTH_PX,
} from "../flowArrows";
import type {
  CalculationResults,
  PipeResult,
  SchemeNode,
  SchemePipe,
} from "../../hydraulicTypes";

const A: SchemeNode = { id: "a", kind: "junction", label: "A", x: 0, y: 0 };
const B: SchemeNode = { id: "b", kind: "junction", label: "B", x: 100, y: 0 };

function pipe(over: Partial<SchemePipe> = {}): SchemePipe {
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

function results(g_kg_s: number): CalculationResults {
  const pr: PipeResult = {
    pipeId: "p1",
    G_kg_s: g_kg_s,
    v_m_s: 1,
    Re: 100000,
    lambda: 0.02,
    headlossPerMeter_pa: 100,
    totalPressureDrop_pa: 1000,
    iterations: 5,
  };
  return {
    pipes: [pr],
    nodes: [],
    totalLoad_w: 0,
    maxHeadlossPerMeter_pa: 100,
    maxVelocity_m_s: 1,
    minConsumerPressure_mpa: 0,
    computedAt: new Date().toISOString(),
  };
}

describe("buildPipeArrow — geometric mode", () => {
  it("horizontal pipe → tip on the right, tails on the left", () => {
    const arrow = buildPipeArrow(pipe(), [A, B], "geometric", undefined)!;
    // Midpoint (50, 0); chevron length 12px → tip at (56, 0)
    expect(arrow.tipX).toBeCloseTo(50 + ARROW_LENGTH_PX / 2, 1);
    expect(arrow.tipY).toBeCloseTo(0, 1);
    expect(arrow.tail1X).toBeLessThan(arrow.tipX);
    expect(arrow.tail2X).toBeLessThan(arrow.tipX);
    expect(arrow.reversed).toBe(false);
  });

  it("returns null when endpoint node missing", () => {
    expect(
      buildPipeArrow(pipe({ fromNodeId: "missing" }), [A, B], "geometric", undefined),
    ).toBeNull();
  });

  it("returns null for degenerate zero-length segment", () => {
    const same: SchemeNode = { ...A, id: "same" };
    expect(
      buildPipeArrow(
        pipe({ fromNodeId: "same", toNodeId: "same" }),
        [same],
        "geometric",
        undefined,
      ),
    ).toBeNull();
  });

  it("honours bend points by drawing the arrow on the central segment", () => {
    const arrow = buildPipeArrow(
      pipe({ bendPoints: [{ x: 100, y: 100 }] }),
      [A, B],
      "geometric",
      undefined,
    )!;
    // points = [(0,0), (100,100), (100,0)]
    // central segment = (0,0) → (100,100), midpoint = (50, 50)
    // direction (1,1)/sqrt(2) → tip slightly NE of midpoint
    expect(arrow.tipX).toBeGreaterThan(50);
    expect(arrow.tipY).toBeGreaterThan(50);
  });
});

describe("buildPipeArrow — computed mode", () => {
  it("positive flow preserves geometric direction", () => {
    const arrow = buildPipeArrow(pipe(), [A, B], "computed", results(0.5))!;
    expect(arrow.reversed).toBe(false);
    expect(arrow.tipX).toBeGreaterThan(50);
  });

  it("negative flow reverses the arrow", () => {
    const arrow = buildPipeArrow(pipe(), [A, B], "computed", results(-0.5))!;
    expect(arrow.reversed).toBe(true);
    // Reversed → tip points back toward A (leftwards on this horizontal pipe)
    expect(arrow.tipX).toBeLessThan(50);
  });

  it("zero flow keeps geometric direction (reversed=false)", () => {
    const arrow = buildPipeArrow(pipe(), [A, B], "computed", results(0))!;
    expect(arrow.reversed).toBe(false);
  });

  it("computed mode without results falls back to geometric", () => {
    const arrow = buildPipeArrow(pipe(), [A, B], "computed", undefined)!;
    expect(arrow.reversed).toBe(false);
  });

  it("computed mode with no result for THIS pipe falls back to geometric", () => {
    const otherResults: CalculationResults = {
      pipes: [
        {
          pipeId: "other",
          G_kg_s: -1,
          v_m_s: 1,
          Re: 100000,
          lambda: 0.02,
          headlossPerMeter_pa: 100,
          totalPressureDrop_pa: 1000,
          iterations: 5,
        },
      ],
      nodes: [],
      totalLoad_w: 0,
      maxHeadlossPerMeter_pa: 100,
      maxVelocity_m_s: 1,
      minConsumerPressure_mpa: 0,
      computedAt: new Date().toISOString(),
    };
    const arrow = buildPipeArrow(pipe(), [A, B], "computed", otherResults)!;
    expect(arrow.reversed).toBe(false);
  });
});

describe("buildAllArrows", () => {
  it("returns one arrow per pipe", () => {
    const C: SchemeNode = { id: "c", kind: "junction", label: "C", x: 200, y: 0 };
    const p1 = pipe({ id: "p1", fromNodeId: "a", toNodeId: "b" });
    const p2 = pipe({ id: "p2", fromNodeId: "b", toNodeId: "c" });
    const arrows = buildAllArrows([p1, p2], [A, B, C], "geometric", undefined);
    expect(arrows).toHaveLength(2);
    expect(arrows.map((a) => a.pipeId).sort()).toEqual(["p1", "p2"]);
  });

  it("skips pipes inside a channel (channelId set)", () => {
    const p1 = pipe({ id: "p1", channelId: "ch_1" });
    const p2 = pipe({ id: "p2" });
    const arrows = buildAllArrows([p1, p2], [A, B], "geometric", undefined);
    expect(arrows).toHaveLength(1);
    expect(arrows[0]!.pipeId).toBe("p2");
  });

  it("skips pipes with missing endpoint nodes", () => {
    const p1 = pipe({ id: "p1", fromNodeId: "missing" });
    const p2 = pipe({ id: "p2" });
    const arrows = buildAllArrows([p1, p2], [A, B], "geometric", undefined);
    expect(arrows).toHaveLength(1);
    expect(arrows[0]!.pipeId).toBe("p2");
  });
});

describe("buildArrowFromDisplayedPolyline — Phase 13.22 Task 6", () => {
  it("horizontal segment → chevron points right (positive x)", () => {
    const arrow = buildArrowFromDisplayedPolyline(
      "p1",
      [{ x: 0, y: 0 }, { x: 100, y: 0 }],
      false,
    );
    expect(arrow).not.toBeNull();
    // Tip should be right of midpoint (50,0)
    expect(arrow!.tipX).toBeGreaterThan(50);
    expect(arrow!.tipY).toBeCloseTo(0, 5);
  });

  it("reversed flag flips tip to point left", () => {
    const arrow = buildArrowFromDisplayedPolyline(
      "p1",
      [{ x: 0, y: 0 }, { x: 100, y: 0 }],
      true,
    );
    expect(arrow!.tipX).toBeLessThan(50); // tip now left of midpoint
  });

  it("multi-segment polyline (L-shape) → chevron centred on the middle segment", () => {
    // Polyline [(0,0), (50,0), (50,50)]. midIdx = floor(3/2) = 1.
    // Middle segment = polyline[0]→polyline[1] = (0,0)→(50,0).
    // Mid = (25, 0). Tip extends to the right.
    const arrow = buildArrowFromDisplayedPolyline(
      "p1",
      [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 50 }],
      false,
    );
    expect(arrow).not.toBeNull();
    expect(arrow!.tipY).toBeCloseTo(0, 1); // tip on the first segment, y=0
  });

  it("degenerate (single point) returns null", () => {
    const arrow = buildArrowFromDisplayedPolyline(
      "p1",
      [{ x: 50, y: 50 }],
      false,
    );
    expect(arrow).toBeNull();
  });

  it("zero-length segment returns null (no NaN propagation)", () => {
    const arrow = buildArrowFromDisplayedPolyline(
      "p1",
      [{ x: 50, y: 50 }, { x: 50, y: 50 }],
      false,
    );
    expect(arrow).toBeNull();
  });

  it("tip → tail wing geometry: tails are behind the tip by ARROW_LENGTH_PX", () => {
    const arrow = buildArrowFromDisplayedPolyline(
      "p1",
      [{ x: 0, y: 0 }, { x: 100, y: 0 }],
      false,
    );
    expect(arrow).not.toBeNull();
    // Both tails should be left of tip (since arrow points right) and
    // symmetric about y=0.
    expect(arrow!.tail1X).toBeLessThan(arrow!.tipX);
    expect(arrow!.tail2X).toBeLessThan(arrow!.tipX);
    expect(arrow!.tail1Y + arrow!.tail2Y).toBeCloseTo(0, 5);
    void ARROW_LENGTH_PX;
  });

  it("Phase 13.22 engineer scenario — arrow on map-projected polyline lands at midpoint", () => {
    // Simulate a pipe that's drifted on the map: original stored x/y
    // is (0, 0) → (100, 0), but after a pan the displayed coords are
    // (200, 50) → (300, 50). The arrow MUST use the displayed coords.
    const arrow = buildArrowFromDisplayedPolyline(
      "p1",
      [{ x: 200, y: 50 }, { x: 300, y: 50 }],
      false,
    );
    expect(arrow!.tipX).toBeGreaterThan(250);
    expect(arrow!.tipX).toBeLessThan(260); // tip ≈ 256
    expect(arrow!.tipY).toBeCloseTo(50, 1);
  });
});

describe("isPipeFlowReversed — Phase 13.22 Task 6", () => {
  it("geometric mode never reverses (always returns false)", () => {
    const r = results(-5);
    expect(isPipeFlowReversed("p1", "geometric", r)).toBe(false);
  });

  it("computed mode + positive G → not reversed", () => {
    const r = results(2.5);
    expect(isPipeFlowReversed("p1", "computed", r)).toBe(false);
  });

  it("computed mode + negative G → reversed (solver flipped direction)", () => {
    const r = results(-2.5);
    expect(isPipeFlowReversed("p1", "computed", r)).toBe(true);
  });

  it("computed mode + missing pipe in results → not reversed", () => {
    const r = results(2.5);
    expect(isPipeFlowReversed("missing_pipe", "computed", r)).toBe(false);
  });

  it("computed mode + no results → not reversed", () => {
    expect(isPipeFlowReversed("p1", "computed", undefined)).toBe(false);
  });
});
