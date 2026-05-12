/**
 * Pump-sizing focused tests — Phase 5A regression bar for DISCREPANCY-002.
 *
 * Background:
 *   sizePump() initially walked the directed supply tree only and missed
 *   the return-leg friction. On a balanced 2-pipe system, return ΔP ≈
 *   supply ΔP, so the under-count is ~50 % of total friction. For
 *   GK-23/02 this dropped H from the engineering-correct 20.3 m to a
 *   17.4 m result — about 4.7 % light. A pump bought at 17.4 m would
 *   stall the return loop at the far end during −39 °C peak load.
 *
 * This file exposes the bug on a minimal 2-node network so the failure
 * mode is unambiguous, then asserts the fix preserves correct totals on
 * the existing GK-23/02 fixture path.
 */
import { describe, it, expect } from "vitest";
import { runFullCalc } from "../hydraulics";
import { loadGKFixtureV2 } from "./_helpers/loadGKFixture";
import type { SchemeNode, SchemePipe, ProjectSettings } from "../../hydraulicTypes";

const SETTINGS: ProjectSettings = {
  networkType: "two_pipe_closed",
  temperatureScheduleKey: "95_70",
  designOutdoorTemp_c: -39,
  city: "ulaanbaatar",
  primaryMaterialCategory: "steel",
  localLossesFraction: 0,
  sourcePressure_mpa: 0.6,
};

/** Minimal two-node network: source ── 100 m DN50 ── consumer (50 kW). */
function makeMinimalNetwork(): { nodes: SchemeNode[]; pipes: SchemePipe[] } {
  const nodes: SchemeNode[] = [
    { id: "src", kind: "source", label: "ЦТП", x: 0, y: 0, requiredPressure_mpa: 0.6 },
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
      id: "p_supply",
      fromNodeId: "src",
      toNodeId: "cst",
      materialKey: "steel_aged",
      dn: 50,
      length_m: 100,
      circuit: "heating_supply",
    },
  ];
  return { nodes, pipes };
}

describe("Pump sizing — DISCREPANCY-002 regression bar", () => {
  it("baseline: supply friction is non-trivial on the minimal network", () => {
    // Sanity floor — if this fails, the minimal network is unhelpful.
    const { nodes, pipes } = makeMinimalNetwork();
    const result = runFullCalc(nodes, pipes, SETTINGS);
    const supplyDp_pa = result.pipes[0]!.totalPressureDrop_pa;
    expect(supplyDp_pa).toBeGreaterThan(100);
  });

  it("H_m must include BOTH supply AND return leg friction (round-trip)", () => {
    // The physically correct H for a balanced 2-pipe system:
    //   H = (ΔP_supply + ΔP_return) / (ρ·g) + Δp_consumer_reserve
    //     where ΔP_return ≈ ΔP_supply (same DN, same flow, same length).
    // The original supply-only solver gave only:
    //   H_old = ΔP_supply / (ρ·g) + Δp_consumer_reserve
    // Asserting the round-trip identity here would fail under the old
    // solver — once the fix lands (sub-phase 5A.2), it passes.
    const { nodes, pipes } = makeMinimalNetwork();
    const result = runFullCalc(nodes, pipes, SETTINGS);
    const supplyDp_pa = result.pipes[0]!.totalPressureDrop_pa;
    const reserve_pa = 0.15 * 1e6; // 0.15 MPa BNbD 41-01 §6.3
    const rho = 970; // approximate water density at 82.5 °C average
    const g = 9.81;
    // Round-trip: 2× supply friction + reserve.
    const expectedH_m = (2 * supplyDp_pa + reserve_pa) / (rho * g);
    expect(result.pump).toBeDefined();
    // ±5 % gives room for ρ rounding (we use the 80 °C entry 972 vs
    // theoretical 970.6) and the per-tick water-property table snap.
    expect(result.pump!.H_m).toBeGreaterThan(expectedH_m * 0.95);
    expect(result.pump!.H_m).toBeLessThan(expectedH_m * 1.05);
  });

  it("GK-23/02 v2 fixture: H_m lands at the fixture's H_m_minimum_required (≥18.3 m)", () => {
    // This is the assertion that was `.skip`-ped in real_project_v2.test.ts
    // pending the DISCREPANCY-002 fix. Re-stated here so the regression
    // bar moves with this commit, not after.
    const { nodes, heatingSupplyPipes, settings } = loadGKFixtureV2();
    const result = runFullCalc(nodes, heatingSupplyPipes, settings);
    expect(result.pump).toBeDefined();
    expect(result.pump!.H_m).toBeGreaterThanOrEqual(18.3);
  });

  it("pump result carries a breakdown of the head components", () => {
    // The fix also exposes a breakdown so the UI can show where each
    // metre of H comes from (supply / return / consumer reserve / margin).
    // Pre-fix the breakdown field is undefined; post-fix it's populated.
    const { nodes, pipes } = makeMinimalNetwork();
    const result = runFullCalc(nodes, pipes, SETTINGS);
    expect(result.pump).toBeDefined();
    expect(result.pump!.breakdown).toBeDefined();
    expect(result.pump!.breakdown!.supplyFriction_m).toBeGreaterThan(0);
    expect(result.pump!.breakdown!.returnFriction_m).toBeGreaterThan(0);
    expect(result.pump!.breakdown!.consumerReserve_m).toBeGreaterThan(14);
    expect(result.pump!.breakdown!.consumerReserve_m).toBeLessThan(17);
  });
});
