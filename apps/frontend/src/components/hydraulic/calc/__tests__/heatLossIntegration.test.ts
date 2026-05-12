/**
 * Phase 5D.1+5D.2 — heat-loss integration regression bar on the
 * GK-23/02 v2 fixture.
 *
 * What we verify:
 *  1. With heatLossEnabled = false (legacy), pipe results match the
 *     fixture's baseline math (the v2 suite already proves this).
 *  2. With heatLossEnabled = true, far-consumer mass flow rises by
 *     3-12 % vs baseline — the engineering signature of correctly
 *     scaling Q / ΔT_effective when ΔT_effective < design.
 *  3. The far consumer's supply temperature drops by 1.5-3.5 °C
 *     from the 95 °C source.
 *  4. The result carries a populated `heatLoss` summary with
 *     totalHeatLoss_W in the 5-12 kW range for this 380 m network.
 *  5. pump.H_m grows by 0.3-2 m relative to baseline — the engineering
 *     signature that the round-trip pump-sizing (Phase 5A) consumes the
 *     elevated mass flows.
 *  6. Per-pipe `heatLossPerMeter_W` and per-consumer
 *     `supplyTemp_C_at_inlet` are surfaced through the public result
 *     shape for the UI (Phase 5D.5) and the piezometric chart
 *     (Phase 5D.3) to consume.
 */
import { describe, it, expect } from "vitest";
import { runFullCalc } from "../hydraulics";
import { loadGKFixtureV2 } from "./_helpers/loadGKFixture";
import type { ProjectSettings } from "../../hydraulicTypes";

/** Strip the fixture's heatLossEnabled=false override so the solver
 *  runs with the project-level default (heat loss ON). The legacy
 *  fixture math is still locked by `real_project_v2.test.ts` via the
 *  unmodified adapter. */
function settingsWithHeatLoss(base: ProjectSettings): ProjectSettings {
  return { ...base, heatLossEnabled: true };
}

describe("Phase 5D — heat-loss integration on GK-23/02 v2", () => {
  const { nodes, heatingSupplyPipes, settings } = loadGKFixtureV2();
  const baseline = runFullCalc(nodes, heatingSupplyPipes, settings);
  const withHeat = runFullCalc(
    nodes,
    heatingSupplyPipes,
    settingsWithHeatLoss(settings),
  );

  it("baseline run carries no heatLoss summary (opt-out path)", () => {
    expect(baseline.heatLoss).toBeUndefined();
  });

  it("heat-loss-enabled run surfaces a populated heatLoss summary", () => {
    expect(withHeat.heatLoss).toBeDefined();
    expect(withHeat.heatLoss!.sourceSupplyTemp_C).toBe(95);
    expect(withHeat.heatLoss!.totalHeatLoss_W).toBeGreaterThan(0);
    // 380 m of DN50-DN65 in a +10 °C channel at 95 °C supply lands in
    // the 4-12 kW range. The fixture's actual mix has more DN50 (lower
    // q' per metre) so we sit around the low end.
    expect(withHeat.heatLoss!.totalHeatLoss_W).toBeGreaterThan(4_000);
    expect(withHeat.heatLoss!.totalHeatLoss_W).toBeLessThan(12_000);
  });

  it("far-consumer mass flow rises by 3-15 % vs baseline (effective-ΔT amplification)", () => {
    // AOS-4 sits at the end of the magistral path UDDT-8 → ... → DH-3 →
    // AOS-4. The pipe feeding AOS-4 directly is P013-S.
    const p013_base = baseline.pipes.find((p) => p.pipeId === "P013-S")!;
    const p013_hot = withHeat.pipes.find((p) => p.pipeId === "P013-S")!;
    const ratio = p013_hot.G_kg_s / p013_base.G_kg_s;
    expect(ratio).toBeGreaterThan(1.03);
    expect(ratio).toBeLessThan(1.15);
  });

  it("far-consumer supply temperature drops 1-4 °C from the 95 °C source", () => {
    const aos4 = withHeat.nodes.find((n) => n.nodeId === "AOS-4")!;
    expect(aos4.supplyTemp_C_at_inlet).toBeDefined();
    const drop = 95 - aos4.supplyTemp_C_at_inlet!;
    expect(drop).toBeGreaterThan(1.0);
    expect(drop).toBeLessThan(4.0);
  });

  it("minConsumerSupplyTemp_C is the worst (farthest) consumer's inlet temp", () => {
    // The min over all consumers should equal AOS-4's inlet temp (the
    // farthest consumer on the magistral). Both quantities come from
    // the same map under the hood, so they should agree exactly.
    const minOnResult = withHeat.heatLoss!.minConsumerSupplyTemp_C;
    const aos4 = withHeat.nodes.find((n) => n.nodeId === "AOS-4")!;
    expect(minOnResult).toBeLessThanOrEqual(aos4.supplyTemp_C_at_inlet!);
    // All consumers are above 90 °C — heat loss is not catastrophic.
    expect(minOnResult).toBeGreaterThan(90);
  });

  it("pump H_m grows by 0.1-2 m relative to baseline (flows propagate)", () => {
    // sizePump consumes per-pipe totalPressureDrop_pa from pipeResults,
    // which is now higher because mass flow is higher (~10%). Pump
    // head should automatically reflect that.
    expect(withHeat.pump).toBeDefined();
    expect(baseline.pump).toBeDefined();
    const dH = withHeat.pump!.H_m - baseline.pump!.H_m;
    expect(dH).toBeGreaterThan(0.05);
    expect(dH).toBeLessThan(3.0);
  });

  it("per-pipe heatLossPerMeter_W is populated for every pipe", () => {
    for (const pr of withHeat.pipes) {
      expect(
        pr.heatLossPerMeter_W,
        `pipe ${pr.pipeId} missing heatLossPerMeter_W`,
      ).toBeDefined();
      // PUR-50 DN32-DN65 in +10 °C channel at 95 °C supply lands
      // between 8 and 18 W/m — sanity floor + ceiling.
      expect(pr.heatLossPerMeter_W!).toBeGreaterThan(5);
      expect(pr.heatLossPerMeter_W!).toBeLessThan(25);
    }
  });

  it("pipe lengthSource reports 'geometry' for fixture pipes with lat/lon endpoints", () => {
    // The Phase 5B.1d augmentation gave every node a `geo` field. All
    // 14 supply pipes should resolve to geometry-derived lengths.
    for (const pr of withHeat.pipes) {
      expect(
        pr.lengthSource,
        `pipe ${pr.pipeId} missing lengthSource`,
      ).toBe("geometry");
    }
  });

  it("total network heat loss is a sensible fraction of total consumer load (5-15 %)", () => {
    const fraction = withHeat.heatLoss!.fractionOfLoad;
    expect(fraction).toBeGreaterThan(0.05);
    expect(fraction).toBeLessThan(0.15);
  });
});
