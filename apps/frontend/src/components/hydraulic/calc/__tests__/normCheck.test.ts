/**
 * Phase 5D.4 — RULE-T01 supply temperature minimum at consumer inlet.
 *
 * Engineer story:
 *   БНбД 41-01-2019 §5.4 requires the supply temperature at the
 *   consumer's ИТП inlet to stay at or above 80 °C (default). Below
 *   that, the heat exchanger can't deliver the design ΔT at the
 *   radiators and the indoor temp drifts below the design 22 °C.
 *
 *   Cold supply at the far consumer happens when the network has too
 *   little / too-thin insulation, or pipes too small for the demanded
 *   ṁ. Either way, the engineer sees this red flag in the norm panel
 *   and reaches for one of: (a) thicker insulation, (b) larger DN,
 *   (c) bypass/recirc loop.
 *
 *   The check is opt-in by design: it only fires when the solver ran
 *   with heat-loss integration enabled (`supplyTemp_C_at_inlet`
 *   populated). Legacy projects without heat-loss data skip the rule.
 */
import { describe, it, expect } from "vitest";
import { checkNorms } from "../normCheck";
import type {
  SchemeNode,
  SchemePipe,
  CalculationResults,
  ProjectSettings,
} from "../../hydraulicTypes";

const BASE_SETTINGS: ProjectSettings = {
  networkType: "two_pipe_closed",
  temperatureScheduleKey: "95_70",
  designOutdoorTemp_c: -39,
  city: "ulaanbaatar",
  primaryMaterialCategory: "steel_v_group",
  localLossesFraction: 0,
  sourcePressure_mpa: 0.6,
};

/** Minimal 2-node + 1-pipe network for the norm-check unit. */
function makeSetup(consumerSupplyT_C: number | undefined) {
  const nodes: SchemeNode[] = [
    {
      id: "src",
      kind: "source",
      label: "ЦТП",
      x: 0,
      y: 0,
      requiredPressure_mpa: 0.6,
    },
    {
      id: "cst",
      kind: "consumer",
      label: "ОС-1",
      x: 100,
      y: 0,
      heatLoad_w: 50_000,
      requiredPressure_mpa: 0.15,
    },
  ];
  const pipes: SchemePipe[] = [
    {
      id: "p1",
      fromNodeId: "src",
      toNodeId: "cst",
      materialKey: "steel_aged",
      dn: 50,
      length_m: 100,
      circuit: "heating_supply",
    },
  ];
  const results: CalculationResults = {
    pipes: [
      {
        pipeId: "p1",
        G_kg_s: 0.5,
        v_m_s: 0.3,
        Re: 30_000,
        lambda: 0.03,
        headlossPerMeter_pa: 20,
        totalPressureDrop_pa: 2000,
        iterations: 5,
      },
    ],
    nodes: [
      { nodeId: "src", pressureAtNode_mpa: 0.6, heatLoad_w: 0 },
      {
        nodeId: "cst",
        pressureAtNode_mpa: 0.45,
        heatLoad_w: 50_000,
        supplyTemp_C_at_inlet: consumerSupplyT_C,
      },
    ],
    totalLoad_w: 50_000,
    maxHeadlossPerMeter_pa: 20,
    maxVelocity_m_s: 0.3,
    minConsumerPressure_mpa: 0.45,
    computedAt: new Date().toISOString(),
  };
  return { nodes, pipes, results };
}

describe("checkNorms — RULE-T01 (Phase 5D.4)", () => {
  it("does NOT flag a consumer with supply temp safely above 80 °C", () => {
    const { nodes, pipes, results } = makeSetup(93.5);
    const violations = checkNorms(nodes, pipes, results, BASE_SETTINGS);
    expect(violations.filter((v) => v.kind === "supply_temp_low")).toEqual([]);
  });

  it("DOES flag a consumer at exactly the threshold (boundary: 79.9 °C)", () => {
    const { nodes, pipes, results } = makeSetup(79.9);
    const violations = checkNorms(nodes, pipes, results, BASE_SETTINGS);
    const supplyT = violations.filter((v) => v.kind === "supply_temp_low");
    expect(supplyT).toHaveLength(1);
    expect(supplyT[0]!.severity).toBe("error");
    expect(supplyT[0]!.target).toEqual({ kind: "node", id: "cst" });
    expect(supplyT[0]!.threshold).toBe(80);
    expect(supplyT[0]!.actual).toBeCloseTo(79.9, 1);
    expect(supplyT[0]!.unit).toBe("°C");
    // Message contains the engineering remediation hints + БНбД ref.
    expect(supplyT[0]!.message).toMatch(/79\.9/);
    expect(supplyT[0]!.message).toMatch(/80/);
    expect(supplyT[0]!.message).toMatch(/БНбД 41-01-2019 §5\.4/);
  });

  it("does NOT trip exactly at the threshold (≥ 80 °C is compliant)", () => {
    const { nodes, pipes, results } = makeSetup(80);
    const violations = checkNorms(nodes, pipes, results, BASE_SETTINGS);
    expect(violations.filter((v) => v.kind === "supply_temp_low")).toEqual([]);
  });

  it("SKIPS the rule when supplyTemp_C_at_inlet is undefined (no heat-loss pass)", () => {
    // Legacy project — solver ran without heat-loss integration, the
    // NodeResult doesn't carry supplyTemp_C_at_inlet. RULE-T01 must
    // NOT fire false positives in that case.
    const { nodes, pipes, results } = makeSetup(undefined);
    const violations = checkNorms(nodes, pipes, results, BASE_SETTINGS);
    expect(violations.filter((v) => v.kind === "supply_temp_low")).toEqual([]);
  });

  it("honours settings.minSupplyTemp_c override (e.g. 75 °C for relaxed projects)", () => {
    // A project explicitly relaxes RULE-T01 to 75 °C — perhaps for an
    // industrial heat client that doesn't need radiator-grade temp.
    const { nodes, pipes, results } = makeSetup(76);
    const relaxed: ProjectSettings = { ...BASE_SETTINGS, minSupplyTemp_c: 75 };
    const strict: ProjectSettings = { ...BASE_SETTINGS, minSupplyTemp_c: 80 };
    const vRelaxed = checkNorms(nodes, pipes, results, relaxed)
      .filter((v) => v.kind === "supply_temp_low");
    const vStrict = checkNorms(nodes, pipes, results, strict)
      .filter((v) => v.kind === "supply_temp_low");
    expect(vRelaxed).toHaveLength(0);
    expect(vStrict).toHaveLength(1);
    expect(vStrict[0]!.threshold).toBe(80);
  });
});
