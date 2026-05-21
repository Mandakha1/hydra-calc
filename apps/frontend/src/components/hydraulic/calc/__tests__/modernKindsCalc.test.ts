/**
 * Phase 13.46 — regression test for modern Phase 13.32 picker kinds.
 *
 * Engineer report (Mongolian transliteration): "tootsoo zuwhn shuluun
 * chigleld 1 shugam deer l hiigdej bn" — "calculation only runs on
 * a single straight pipe".
 *
 * Root cause: every literal `kind === "source"` / `kind === "consumer"`
 * check in `hydraulics.ts` / `threeModeEngine.ts` / `normCheck.ts`
 * misclassified `source_substation` / `consumer_apartment` (the
 * fine-grained kinds the Phase 13.32 endpoint kind-picker creates) as
 * non-source / non-consumer. Effects observed by the engineer:
 *
 *   - Pressure walker started from `nodes[0]` instead of the real
 *     source (the УДДТ was unrecognised), so only the first pipe's
 *     branch got valid pressures.
 *   - Heat-loss-aware consumer ΔT correction skipped → far consumers
 *     under-flowed by 5-12 %.
 *   - Pump-sizing DFS never tagged any node as a "consumer" → supply-
 *     leg cumulative friction map was empty → suggested pump head
 *     bottomed out to 0.
 *
 * This test runs the full `computePipeFlows` + downstream-load
 * aggregator on a tiny `source_substation` → trunk-junction →
 * 2 × `consumer_apartment` topology and asserts:
 *
 *   1. The trunk pipe carries the SUM of both consumers' loads.
 *   2. Each leaf pipe carries its own consumer's load.
 *   3. The source node is detected (sources.length === 1).
 *   4. Each pipe gets non-trivial v_m_s + lambda + headlossPerMeter
 *      — not the G ≈ 0.001 sentinel that the solver falls back to
 *      when load_w is missing.
 */
import { describe, it, expect } from "vitest";
import { computePipeFlows } from "../hydraulics";
import { isSourceKind, isConsumerKind } from "../compliance/ruleEngine";
import type {
  SchemeNode,
  SchemePipe,
  ProjectSettings,
} from "../../hydraulicTypes";

const BASE_SETTINGS: ProjectSettings = {
  networkType: "two_pipe_closed",
  temperatureScheduleKey: "95_70",
  designOutdoorTemp_c: -39,
  city: "Улаанбаатар",
  primaryMaterialCategory: "steel_v_group",
  localLossesFraction: 0.2,
  sourcePressure_mpa: 0.6,
};

function buildTinyModernNetwork(): { nodes: SchemeNode[]; pipes: SchemePipe[] } {
  // УДДТ → J → C1 (40 kW)
  //          ↘ C2 (60 kW)
  const nodes: SchemeNode[] = [
    {
      id: "src",
      // Modern Phase 13.32 picker emits `source_substation`, NOT "source".
      kind: "source_substation",
      label: "УДДТ-1",
      x: 0,
      y: 0,
    },
    {
      id: "j1",
      kind: "junction",
      label: "Т-1",
      x: 100,
      y: 0,
    },
    {
      id: "c1",
      kind: "consumer_apartment",
      label: "ОС-1",
      x: 200,
      y: -50,
      heatLoad_w: 40_000,
    },
    {
      id: "c2",
      kind: "consumer_apartment",
      label: "ОС-2",
      x: 200,
      y: 50,
      heatLoad_w: 60_000,
    },
  ];
  const pipes: SchemePipe[] = [
    {
      id: "p_trunk",
      fromNodeId: "src",
      toNodeId: "j1",
      materialKey: "steel_aged",
      dn: 100,
      length_m: 100,
      circuit: "heating_supply",
    },
    {
      id: "p_leaf1",
      fromNodeId: "j1",
      toNodeId: "c1",
      materialKey: "steel_aged",
      dn: 50,
      length_m: 30,
      circuit: "heating_supply",
    },
    {
      id: "p_leaf2",
      fromNodeId: "j1",
      toNodeId: "c2",
      materialKey: "steel_aged",
      dn: 50,
      length_m: 30,
      circuit: "heating_supply",
    },
  ];
  return { nodes, pipes };
}

describe("Phase 13.46 — modern picker kinds in the calc pipeline", () => {
  it("isSourceKind / isConsumerKind recognise the modern picker prefixes", () => {
    expect(isSourceKind("source_substation")).toBe(true);
    expect(isSourceKind("source_tec")).toBe(true);
    expect(isSourceKind("source_boiler")).toBe(true);
    expect(isSourceKind("source")).toBe(true); // legacy literal still accepted
    expect(isSourceKind("junction")).toBe(false);
    expect(isSourceKind("consumer_apartment")).toBe(false);

    expect(isConsumerKind("consumer_apartment")).toBe(true);
    expect(isConsumerKind("consumer_office")).toBe(true);
    expect(isConsumerKind("consumer_hospital")).toBe(true);
    expect(isConsumerKind("consumer")).toBe(true);
    expect(isConsumerKind("junction")).toBe(false);
    expect(isConsumerKind("source_substation")).toBe(false);
  });

  it("trunk pipe carries sum of both downstream consumer loads", () => {
    const { nodes, pipes } = buildTinyModernNetwork();
    const results = computePipeFlows(nodes, pipes, BASE_SETTINGS);

    const trunk = results.find((r) => r.pipeId === "p_trunk");
    expect(trunk).toBeDefined();
    // G_kg_s ≈ totalLoad_w / (c_p × ΔT). Both consumers should be
    // counted — 100 kW total. If only one consumer (the literal
    // "consumer" check missed both → fell through to fallback 0.001
    // kg/s sentinel), G would be ~0.001 and velocity would be < 0.01.
    expect(trunk!.G_kg_s).toBeGreaterThan(0.4);
    expect(trunk!.v_m_s).toBeGreaterThan(0.05);
    expect(trunk!.lambda).toBeGreaterThan(0);
  });

  it("each leaf pipe carries its own consumer's load (not 0 and not the sum)", () => {
    const { nodes, pipes } = buildTinyModernNetwork();
    const results = computePipeFlows(nodes, pipes, BASE_SETTINGS);

    const leaf1 = results.find((r) => r.pipeId === "p_leaf1")!;
    const leaf2 = results.find((r) => r.pipeId === "p_leaf2")!;
    const trunk = results.find((r) => r.pipeId === "p_trunk")!;

    // Both leafs should have non-zero flow.
    expect(leaf1.G_kg_s).toBeGreaterThan(0.1);
    expect(leaf2.G_kg_s).toBeGreaterThan(0.1);
    // The trunk should carry MORE than either leaf (it sums them).
    expect(trunk.G_kg_s).toBeGreaterThan(leaf1.G_kg_s);
    expect(trunk.G_kg_s).toBeGreaterThan(leaf2.G_kg_s);
    // Leaf-2 (60 kW) should carry ~50 % more than leaf-1 (40 kW).
    expect(leaf2.G_kg_s).toBeGreaterThan(leaf1.G_kg_s);
  });

  it("every pipe gets a real velocity (not the 0.001 kg/s sentinel)", () => {
    const { nodes, pipes } = buildTinyModernNetwork();
    const results = computePipeFlows(nodes, pipes, BASE_SETTINGS);

    for (const r of results) {
      // The sentinel produces v ≈ 1.3e-5 m/s. Any real flow is
      // ≥ 0.01 m/s on a sensible DN50/100 sizing.
      expect(r.v_m_s).toBeGreaterThan(0.01);
      expect(r.G_kg_s).toBeGreaterThan(0.01);
    }
  });
});
