/**
 * Phase 8.2 — pure helper tests for the energy scheme view model.
 *
 * Synthetic `CalculationResults` fixtures cover:
 *   - Heat balance math (source = consumers + losses)
 *   - Per-consumer fraction-of-total derivation
 *   - Source-kind exclusion from consumer rows
 *   - Per-circuit aggregation across multiple pipes
 *   - Phase 5D supply-temp + 80 °C minimum norm check
 *   - Empty / error states
 *   - Circuit / kind label friendliness
 */
import { describe, it, expect } from "vitest";
import {
  buildEnergyScheme,
  circuitLabel,
  consumerKindLabel,
  type EnergyScheme,
} from "../energyScheme";
import type {
  CalculationResults,
  SchemeNode,
  SchemePipe,
} from "../../hydraulicTypes";

/* ─── Test fixtures ─────────────────────────────────────────── */

function node(id: string, kind: string, label = id): SchemeNode {
  return { id, kind, label, x: 0, y: 0 };
}

function pipe(id: string, from: string, to: string, length_m: number, circuit?: string): SchemePipe {
  return {
    id,
    fromNodeId: from,
    toNodeId: to,
    materialKey: "steel_aged",
    dn: 100,
    length_m,
    ...(circuit ? { circuit: circuit as SchemePipe["circuit"] } : {}),
  };
}

function results(opts: {
  nodes: Array<{ id: string; load_w: number; supplyTemp_C?: number }>;
  pipes: Array<{ id: string; lossPerM_W: number }>;
  totalLoss_W?: number;
  minSupplyTemp_C?: number;
  sourceSupplyTemp_C?: number;
  pumpP_kW?: number;
}): CalculationResults {
  return {
    nodes: opts.nodes.map((n) => ({
      nodeId: n.id,
      pressureAtNode_mpa: 0.4,
      heatLoad_w: n.load_w,
      ...(typeof n.supplyTemp_C === "number" ? { supplyTemp_C_at_inlet: n.supplyTemp_C } : {}),
    })),
    pipes: opts.pipes.map((p) => ({
      pipeId: p.id,
      G_kg_s: 1,
      v_m_s: 1,
      Re: 1,
      lambda: 0.02,
      headlossPerMeter_pa: 100,
      totalPressureDrop_pa: 1000,
      iterations: 1,
      heatLossPerMeter_W: p.lossPerM_W,
    })),
    totalLoad_w: opts.nodes.reduce((s, n) => s + n.load_w, 0),
    maxHeadlossPerMeter_pa: 100,
    maxVelocity_m_s: 1,
    minConsumerPressure_mpa: 0.2,
    ...(typeof opts.totalLoss_W === "number"
      ? {
          heatLoss: {
            totalHeatLoss_W: opts.totalLoss_W,
            fractionOfLoad: opts.totalLoss_W / Math.max(1, opts.nodes.reduce((s, n) => s + n.load_w, 0)),
            minConsumerSupplyTemp_C: opts.minSupplyTemp_C ?? 95,
            sourceSupplyTemp_C: opts.sourceSupplyTemp_C ?? 95,
          },
        }
      : {}),
    ...(typeof opts.pumpP_kW === "number"
      ? { pump: { H_m: 30, Q_m3h: 10, P_kW: opts.pumpP_kW } }
      : {}),
    computedAt: new Date().toISOString(),
  };
}

/* ─── Error states ─────────────────────────────────────────── */

describe("buildEnergyScheme — error states (Phase 8.2)", () => {
  it("returns error when results is undefined", () => {
    const r = buildEnergyScheme([], [], undefined);
    expect("error" in r).toBe(true);
    if ("error" in r) expect(r.error).toMatch(/Тооцоолох/);
  });

  it("returns error when results has no nodes", () => {
    const calc = results({ nodes: [], pipes: [] });
    const r = buildEnergyScheme([], [], calc);
    expect("error" in r).toBe(true);
  });
});

/* ─── Heat balance ─────────────────────────────────────────── */

describe("buildEnergyScheme — heat balance math (Phase 8.2)", () => {
  it("source output = consumers + distribution losses", () => {
    const nodes = [
      node("src", "source_substation"),
      node("c1", "consumer_apartment"),
      node("c2", "consumer_school"),
    ];
    const pipes = [
      pipe("p1", "src", "c1", 100, "heating_supply"),
      pipe("p2", "src", "c2", 200, "heating_supply"),
    ];
    const calc = results({
      nodes: [
        { id: "src", load_w: 0 },
        { id: "c1", load_w: 50_000 },
        { id: "c2", load_w: 30_000 },
      ],
      pipes: [
        { id: "p1", lossPerM_W: 30 },
        { id: "p2", lossPerM_W: 25 },
      ],
      totalLoss_W: 30 * 100 + 25 * 200, // 3000 + 5000 = 8000 W
    });
    const r = buildEnergyScheme(nodes, pipes, calc) as EnergyScheme;
    expect(r.balance.totalConsumerLoad_kw).toBeCloseTo(80, 3);
    expect(r.balance.totalDistributionLoss_kw).toBeCloseTo(8, 3);
    expect(r.balance.sourceOutput_kw).toBeCloseTo(88, 3);
    expect(r.balance.lossFraction).toBeCloseTo(8 / 88, 4);
  });

  it("loss fraction is zero when heat-loss data is absent", () => {
    const nodes = [
      node("src", "source_substation"),
      node("c1", "consumer_apartment"),
    ];
    const pipes = [pipe("p1", "src", "c1", 100, "heating_supply")];
    const calc = results({
      nodes: [
        { id: "src", load_w: 0 },
        { id: "c1", load_w: 50_000 },
      ],
      pipes: [{ id: "p1", lossPerM_W: 0 }], // explicit zero
      // no totalLoss_W → heatLoss undefined
    });
    const r = buildEnergyScheme(nodes, pipes, calc) as EnergyScheme;
    expect(r.balance.totalDistributionLoss_kw).toBe(0);
    expect(r.balance.lossFraction).toBe(0);
    expect(r.balance.sourceOutput_kw).toBeCloseTo(50, 3);
  });
});

/* ─── Consumer rows ────────────────────────────────────────── */

describe("buildEnergyScheme — consumer rows (Phase 8.2)", () => {
  it("source-kind nodes are excluded from consumer rows", () => {
    const nodes = [
      node("src", "source_tec"),
      node("c1", "consumer_apartment"),
    ];
    const calc = results({
      // source has heatLoad_w (e.g. solver writes net production) — must NOT appear in consumers
      nodes: [
        { id: "src", load_w: 500_000 },
        { id: "c1", load_w: 50_000 },
      ],
      pipes: [],
    });
    const r = buildEnergyScheme(nodes, [], calc) as EnergyScheme;
    expect(r.consumers.map((row) => row.nodeId)).toEqual(["c1"]);
  });

  it("consumers are sorted descending by load", () => {
    const nodes = [
      node("c1", "consumer_apartment", "small"),
      node("c2", "consumer_school", "big"),
      node("c3", "consumer_office", "medium"),
    ];
    const calc = results({
      nodes: [
        { id: "c1", load_w: 30_000 },
        { id: "c2", load_w: 100_000 },
        { id: "c3", load_w: 50_000 },
      ],
      pipes: [],
    });
    const r = buildEnergyScheme(nodes, [], calc) as EnergyScheme;
    expect(r.consumers.map((row) => row.label)).toEqual(["big", "medium", "small"]);
  });

  it("fractionOfTotal sums to ~1 across all consumer rows", () => {
    const nodes = [
      node("c1", "consumer_apartment"),
      node("c2", "consumer_school"),
      node("c3", "consumer_office"),
    ];
    const calc = results({
      nodes: [
        { id: "c1", load_w: 25_000 },
        { id: "c2", load_w: 50_000 },
        { id: "c3", load_w: 25_000 },
      ],
      pipes: [],
    });
    const r = buildEnergyScheme(nodes, [], calc) as EnergyScheme;
    const sum = r.consumers.reduce((s, row) => s + row.fractionOfTotal, 0);
    expect(sum).toBeCloseTo(1, 4);
    // 50/(25+50+25)=0.5 for the biggest, 0.25 each for the others.
    expect(r.consumers[0]!.fractionOfTotal).toBeCloseTo(0.5, 3);
  });

  it("Phase 5D supplyTemp_C propagates onto each consumer row", () => {
    const nodes = [node("c1", "consumer_apartment")];
    const calc = results({
      nodes: [{ id: "c1", load_w: 50_000, supplyTemp_C: 88.5 }],
      pipes: [],
    });
    const r = buildEnergyScheme(nodes, [], calc) as EnergyScheme;
    expect(r.consumers[0]!.supplyTemp_C).toBe(88.5);
  });
});

/* ─── Circuit losses ───────────────────────────────────────── */

describe("buildEnergyScheme — per-circuit aggregation (Phase 8.2)", () => {
  it("sums loss + length across pipes on the same circuit", () => {
    const pipes = [
      pipe("p1", "a", "b", 100, "heating_supply"),
      pipe("p2", "b", "c", 200, "heating_supply"),
      pipe("p3", "a", "d", 150, "heating_return"),
    ];
    const calc = results({
      nodes: [{ id: "x", load_w: 50_000 }], // dummy consumer
      pipes: [
        { id: "p1", lossPerM_W: 20 }, // 2000 W
        { id: "p2", lossPerM_W: 15 }, // 3000 W
        { id: "p3", lossPerM_W: 25 }, // 3750 W
      ],
      totalLoss_W: 2000 + 3000 + 3750,
    });
    const r = buildEnergyScheme(
      [node("x", "consumer_apartment")],
      pipes,
      calc,
    ) as EnergyScheme;
    const supply = r.circuitLosses.find((c) => c.circuit === "heating_supply")!;
    expect(supply.totalLength_m).toBe(300);
    expect(supply.loss_w).toBeCloseTo(5000, 3);
    expect(supply.avgLossPerMeter_W).toBeCloseTo(5000 / 300, 3);
    const ret = r.circuitLosses.find((c) => c.circuit === "heating_return")!;
    expect(ret.loss_w).toBeCloseTo(3750, 3);
  });

  it("pipes without a circuit go under 'unknown'", () => {
    const pipes = [pipe("p1", "a", "b", 100)]; // no circuit
    const calc = results({
      nodes: [{ id: "x", load_w: 1 }],
      pipes: [{ id: "p1", lossPerM_W: 10 }],
      totalLoss_W: 1000,
    });
    const r = buildEnergyScheme(
      [node("x", "consumer_apartment")],
      pipes,
      calc,
    ) as EnergyScheme;
    expect(r.circuitLosses.some((c) => c.circuit === "unknown")).toBe(true);
  });
});

/* ─── Min supply temp norm check ───────────────────────────── */

describe("buildEnergyScheme — БНбД 41-01 §5.4 minimum temp (Phase 8.2)", () => {
  it("meetsMinSupplyTemp = true when minConsumerSupplyTemp_C >= 80 °C", () => {
    const calc = results({
      nodes: [{ id: "c1", load_w: 50_000 }],
      pipes: [],
      totalLoss_W: 5000,
      minSupplyTemp_C: 85,
    });
    const r = buildEnergyScheme([node("c1", "consumer_apartment")], [], calc) as EnergyScheme;
    expect(r.balance.meetsMinSupplyTemp).toBe(true);
  });

  it("meetsMinSupplyTemp = false when minConsumerSupplyTemp_C < 80 °C", () => {
    const calc = results({
      nodes: [{ id: "c1", load_w: 50_000 }],
      pipes: [],
      totalLoss_W: 5000,
      minSupplyTemp_C: 76.3,
    });
    const r = buildEnergyScheme([node("c1", "consumer_apartment")], [], calc) as EnergyScheme;
    expect(r.balance.meetsMinSupplyTemp).toBe(false);
  });

  it("meetsMinSupplyTemp = true (defensive) when heat-loss data is absent", () => {
    const calc = results({
      nodes: [{ id: "c1", load_w: 50_000 }],
      pipes: [],
    });
    const r = buildEnergyScheme([node("c1", "consumer_apartment")], [], calc) as EnergyScheme;
    expect(r.balance.meetsMinSupplyTemp).toBe(true);
  });
});

/* ─── Label helpers ────────────────────────────────────────── */

describe("circuitLabel + consumerKindLabel", () => {
  it("circuitLabel returns Mongolian engineer-friendly labels for known keys", () => {
    expect(circuitLabel("heating_supply")).toBe("Халаалт нийлүүлэх (Т1)");
    expect(circuitLabel("heating_return")).toBe("Халаалт буцах (Т2)");
    expect(circuitLabel("dhw_supply")).toBe("Халуун ус (Т3)");
    expect(circuitLabel("unknown")).toBe("Тодорхойгүй");
  });

  it("circuitLabel falls back to the raw key for unrecognised circuits", () => {
    expect(circuitLabel("custom_zulu_42")).toBe("custom_zulu_42");
  });

  it("consumerKindLabel returns the nodeCatalog shortLabel when known", () => {
    // "consumer_apartment" exists in nodeCatalog with shortLabel "ОС".
    expect(consumerKindLabel("consumer_apartment")).toBe("ОС");
  });

  it("consumerKindLabel falls back to the raw kind when unknown", () => {
    expect(consumerKindLabel("custom_kind")).toBe("custom_kind");
  });
});
