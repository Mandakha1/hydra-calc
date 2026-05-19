/**
 * Phase 13.21 — Pipe label content tests.
 *
 * Locks the engineer-facing line breakdown so labels render consistently
 * across the SVG canvas, PDF export, and PDF Drawing Set.
 */
import { describe, it, expect } from "vitest";
import { buildPipeLabelLines, inferPipeQ_kW } from "../pipeLabel";
import type { SchemePipe, SchemeNode, CalculationResults } from "../../hydraulicTypes";

function pipe(id: string, overrides?: Partial<SchemePipe>): SchemePipe {
  return {
    id,
    fromNodeId: "a",
    toNodeId: "b",
    materialKey: "steel_aged",
    dn: 100,
    length_m: 35.6,
    circuit: "heating_supply",
    ...overrides,
  };
}

function results(opts: { pipeId: string; G_kg_s: number; v_m_s?: number; R?: number; dP?: number }): CalculationResults {
  return {
    pipes: [
      {
        pipeId: opts.pipeId,
        G_kg_s: opts.G_kg_s,
        v_m_s: opts.v_m_s ?? 0.77,
        Re: 100_000,
        lambda: 0.025,
        headlossPerMeter_pa: opts.R ?? 36.9,
        totalPressureDrop_pa: opts.dP ?? 200,
        iterations: 5,
      },
    ],
    nodes: [],
    totalLoad_w: 0,
    maxHeadlossPerMeter_pa: opts.R ?? 36.9,
    maxVelocity_m_s: opts.v_m_s ?? 0.77,
    minConsumerPressure_mpa: 0.4,
    computedAt: new Date().toISOString(),
  };
}

describe("inferPipeQ_kW — Phase 13.21", () => {
  it("uses G × c × ΔT when solver results exist", () => {
    const r = results({ pipeId: "p1", G_kg_s: 24.08 });
    // 24.08 × 4.186 × 60 ≈ 6 047 kW
    const q = inferPipeQ_kW(pipe("p1"), undefined, r, 60);
    expect(q).toBeCloseTo(24.08 * 4.186 * 60, 0);
  });

  it("falls back to fromNode.heatLoad_w when no results", () => {
    const fromNode: SchemeNode = {
      id: "a",
      kind: "consumer_apartment",
      label: "АОС-1",
      x: 0,
      y: 0,
      heatLoad_w: 405_000,
    };
    const q = inferPipeQ_kW(pipe("p1"), fromNode, undefined, 60);
    expect(q).toBe(405);
  });

  it("returns 0 for cold-water circuits (no thermal energy)", () => {
    const r = results({ pipeId: "p1", G_kg_s: 5 });
    const q = inferPipeQ_kW(pipe("p1", { circuit: "cold_water" }), undefined, r, 60);
    expect(q).toBe(0);
  });

  it("returns 0 when neither results nor fromNode load is available", () => {
    const q = inferPipeQ_kW(pipe("p1"), undefined, undefined, 60);
    expect(q).toBe(0);
  });

  it("falls back to circuit-typical ΔT when scheduleDeltaT_c is 0", () => {
    const r = results({ pipeId: "p1", G_kg_s: 5 });
    // heating_supply default ΔT = 20°C → 5 × 4.186 × 20 = 418.6 kW
    const q = inferPipeQ_kW(pipe("p1"), undefined, r, 0);
    expect(q).toBeCloseTo(418.6, 1);
  });
});

describe("buildPipeLabelLines — Phase 13.21", () => {
  it("renders 4 lines on a solved heating pipe (section / DN / Q+v / ΔP)", () => {
    const r = results({ pipeId: "p1", G_kg_s: 24.08, v_m_s: 0.77, R: 37, dP: 200 });
    const lines = buildPipeLabelLines({
      pipe: pipe("p1"),
      fromIndex: 1,
      toIndex: 2,
      fromNode: undefined,
      results: r,
      scheduleDeltaT_c: 60,
    });
    expect(lines).toHaveLength(4);
    expect(lines[0]!.text).toBe("1-2 · Т1");
    expect(lines[0]!.accent).toBe(true);
    expect(lines[1]!.text).toContain("DN100");
    expect(lines[1]!.text).toContain("L=36м"); // rounded above 10m
    expect(lines[2]!.text).toMatch(/Q=6047|Q=6.05 МВт/);
    expect(lines[2]!.text).toContain("v=0.77 м/с");
    expect(lines[3]!.text).toContain("ΔP=200 Pa");
    expect(lines[3]!.text).toContain("R=37 Pa/м");
  });

  it("shows v-only line when Q is 0 (cold water with results)", () => {
    const r = results({ pipeId: "p1", G_kg_s: 5 });
    const lines = buildPipeLabelLines({
      pipe: pipe("p1", { circuit: "cold_water" }),
      fromIndex: 3,
      toIndex: 4,
      fromNode: undefined,
      results: r,
      scheduleDeltaT_c: 60,
    });
    expect(lines).toHaveLength(4);
    expect(lines[0]!.text).toBe("3-4 · В1");
    expect(lines[2]!.text).toBe("v=0.77 м/с");
    expect(lines[3]!.text).toContain("ΔP=");
  });

  it("emits only section + DN lines when no solver results", () => {
    const lines = buildPipeLabelLines({
      pipe: pipe("p1"),
      fromIndex: 1,
      toIndex: 2,
      fromNode: undefined,
      results: undefined,
      scheduleDeltaT_c: 60,
    });
    expect(lines).toHaveLength(2);
    expect(lines[0]!.text).toBe("1-2 · Т1");
    expect(lines[1]!.text).toContain("DN100");
  });

  it("formats large Q values as МВт (>1000 kW)", () => {
    const r = results({ pipeId: "p1", G_kg_s: 50 });
    const lines = buildPipeLabelLines({
      pipe: pipe("p1"),
      fromIndex: 1,
      toIndex: 2,
      fromNode: undefined,
      results: r,
      scheduleDeltaT_c: 60,
    });
    // 50 × 4.186 × 60 = 12 558 kW = 12.56 МВт
    expect(lines[2]!.text).toMatch(/МВт/);
  });

  it("formats large ΔP values as kPa (≥1000 Pa)", () => {
    const r = results({ pipeId: "p1", G_kg_s: 5, dP: 12500 });
    const lines = buildPipeLabelLines({
      pipe: pipe("p1"),
      fromIndex: 1,
      toIndex: 2,
      fromNode: undefined,
      results: r,
      scheduleDeltaT_c: 60,
    });
    expect(lines[3]!.text).toContain("ΔP=12.5 кПа");
  });

  it("uses 1-decimal length for sub-10m pipes (engineer expects precision)", () => {
    const lines = buildPipeLabelLines({
      pipe: pipe("p1", { length_m: 3.5 }),
      fromIndex: 1,
      toIndex: 2,
      fromNode: undefined,
      results: undefined,
      scheduleDeltaT_c: 60,
    });
    expect(lines[1]!.text).toContain("L=3.5м");
  });

  it("circuit codes — Т1/Т2/Т3/Т4/В1", () => {
    const circuits = [
      ["heating_supply", "Т1"],
      ["heating_return", "Т2"],
      ["dhw_supply", "Т3"],
      ["dhw_recirc", "Т4"],
      ["cold_water", "В1"],
    ] as const;
    for (const [c, code] of circuits) {
      const lines = buildPipeLabelLines({
        pipe: pipe("p", { circuit: c }),
        fromIndex: 1,
        toIndex: 2,
        fromNode: undefined,
        results: undefined,
        scheduleDeltaT_c: 60,
      });
      expect(lines[0]!.text).toContain(code);
    }
  });
});
