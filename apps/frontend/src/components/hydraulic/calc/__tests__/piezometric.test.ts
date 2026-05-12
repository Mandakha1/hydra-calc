/**
 * Piezometric calculator tests.
 *
 * Uses a synthetic 6-node tree network matching the GK-23/02 fixture's
 * topology shape (one ЦТП source, one intermediate junction, then 5
 * consumers branching off). Loads and pipe sizes mirror the fixture so
 * the test exercises the same arithmetic the production solver runs in
 * the editor.
 *
 * Fixture data: tests/fixtures/real_project_001.json (loaded relatively).
 *
 * What we cover:
 *  - Profile builds without throwing.
 *  - All Phase 1B norm-check expectations hold at pump_head = 30 m.
 *  - A violation appears when pump_head is starved (5 m).
 *  - Available ΔP at the last consumer is ≥ 5 m (sanity floor —
 *    the strict БНбД 41-01 §6.3 limit is 15 m and is asserted in the
 *    happy-path test below).
 */
import { describe, it, expect, beforeAll } from "vitest";
import { computePipeFlows } from "../hydraulics";
import { computePiezometricProfile } from "../piezometric";
import type { SchemeNode, SchemePipe, ProjectSettings } from "../../hydraulicTypes";
import fixture from "../../../../../../../tests/fixtures/real_project_001.json";

interface FixtureConsumer {
  id: string;
  load_total_W: number;
}

/** Build a synthetic SchemePipe network that matches the fixture's
 *  topology but with concrete node x/y placements so the solver can run. */
function buildSyntheticNetwork(): { nodes: SchemeNode[]; pipes: SchemePipe[] } {
  const consumers = fixture.consumers as FixtureConsumer[];

  // Source (УДДТ-8) at origin, intermediate junction UHT-1 a short hop east,
  // then 5 consumers radiating north-east-south-east-south in a fan so
  // findLongestPath has a deterministic farthest target.
  const nodes: SchemeNode[] = [
    {
      id: "UDDT-8",
      kind: "source_substation",
      label: "УДДТ-8",
      x: 0,
      y: 0,
      requiredPressure_mpa: 0.6,
    },
    {
      id: "UHT-1",
      kind: "chamber",
      label: "UHT-1",
      x: 200 * 20, // 200 m east (PX_PER_METER = 20)
      y: 0,
    },
  ];
  // 5 consumers at varying distances so the path-length ordering is clear.
  const consumerDistancesM = [50, 80, 120, 150, 180];
  consumers.forEach((c, idx) => {
    nodes.push({
      id: c.id,
      kind: "consumer_apartment",
      label: c.id,
      x: nodes[1]!.x + consumerDistancesM[idx]! * 20,
      y: (idx - 2) * 50 * 20, // fan vertically
      heatLoad_w: c.load_total_W,
      requiredPressure_mpa: 0.15,
      floors: 2,
      width_m: 12,
      height_m: 10,
    });
  });

  // Primary line: УДДТ-8 → UHT-1 (DN 65, 200 m). Then branches to each AOS.
  const pipes: SchemePipe[] = [
    {
      id: "p_UDDT-UHT1",
      fromNodeId: "UDDT-8",
      toNodeId: "UHT-1",
      materialKey: "steel_aged",
      dn: 65,
      length_m: 200,
      circuit: "heating_supply",
    },
  ];
  consumers.forEach((c, idx) => {
    pipes.push({
      id: `p_UHT1-${c.id}`,
      fromNodeId: "UHT-1",
      toNodeId: c.id,
      materialKey: "steel_aged",
      dn: 40,
      length_m: consumerDistancesM[idx]!,
      circuit: "heating_supply",
    });
  });

  return { nodes, pipes };
}

const SETTINGS: ProjectSettings = {
  networkType: "two_pipe_closed",
  temperatureScheduleKey: "95_70",
  designOutdoorTemp_c: -39,
  city: "ulaanbaatar",
  primaryMaterialCategory: "steel",
  localLossesFraction: 0.3,
  sourcePressure_mpa: 0.6,
};

describe("piezometric — GK-23/02 synthetic-topology fixture", () => {
  let net: ReturnType<typeof buildSyntheticNetwork>;

  beforeAll(() => {
    net = buildSyntheticNetwork();
  });

  it("synthetic network sanity: 7 nodes, 6 pipes, all consumers connected", () => {
    expect(net.nodes.length).toBe(7); // 1 source + 1 junction + 5 consumers
    expect(net.pipes.length).toBe(6); // 1 primary + 5 branches
  });

  it("computePipeFlows runs without NaN on the synthetic network", () => {
    const results = computePipeFlows(net.nodes, net.pipes, SETTINGS);
    expect(results.length).toBe(net.pipes.length);
    for (const r of results) {
      expect(Number.isFinite(r.G_kg_s)).toBe(true);
      expect(Number.isFinite(r.v_m_s)).toBe(true);
      expect(Number.isFinite(r.totalPressureDrop_pa)).toBe(true);
    }
  });

  it("builds a piezometric profile without throwing (default pump 30 m)", () => {
    const profile = computePiezometricProfile({
      nodes: net.nodes,
      pipes: net.pipes,
      settings: SETTINGS,
    });
    expect(profile.points.length).toBeGreaterThanOrEqual(3); // source + at least 1 junction + 1 consumer
    expect(profile.sourceId).toBe("UDDT-8");
    // Farthest consumer is AOS-5 by our 180 m branch length.
    expect(profile.consumerId).toBe("AOS-5");
    expect(profile.totalFrictionHeadM).toBeGreaterThan(0);
  });

  it("at pump head = 30 m, no consumer violates the БНбД 41-01 §6.3 Δp ≥ 0.15 MPa rule", () => {
    const profile = computePiezometricProfile({
      nodes: net.nodes,
      pipes: net.pipes,
      settings: SETTINGS,
      pumpHeadM: 30,
      // Place consumers slightly above source so the rise-against-gravity
      // term is realistic but not punishing.
      consumerElevationsM: {
        "AOS-1": 1270,
        "AOS-2": 1270,
        "AOS-3": 1270,
        "AOS-4": 1270,
        "AOS-5": 1270,
      },
      sourceElevationM: 1269,
      buildingHeightsM: {
        "AOS-1": 6,
        "AOS-2": 6,
        "AOS-3": 6,
        "AOS-4": 6,
        "AOS-5": 6,
      },
    });
    const dpViolations = profile.violations.filter((v) => v.rule === "available_dp_below_min");
    expect(dpViolations).toEqual([]);
  });

  it("at pump head = 5 m (starved), at least one violation appears", () => {
    const profile = computePiezometricProfile({
      nodes: net.nodes,
      pipes: net.pipes,
      settings: SETTINGS,
      pumpHeadM: 5,
      sourceElevationM: 1269,
      consumerElevationsM: {
        "AOS-1": 1270,
        "AOS-2": 1270,
        "AOS-3": 1270,
        "AOS-4": 1270,
        "AOS-5": 1270,
      },
      buildingHeightsM: {
        "AOS-1": 6,
        "AOS-2": 6,
        "AOS-3": 6,
        "AOS-4": 6,
        "AOS-5": 6,
      },
    });
    // 5 m of pump head is below the БНбД consumer Δp ≥ 15 m requirement
    // by design — every consumer should report available_dp_below_min.
    const dpViolations = profile.violations.filter((v) => v.rule === "available_dp_below_min");
    expect(dpViolations.length).toBeGreaterThan(0);
  });

  it("available ΔP at the last consumer is ≥ 5 m on a reasonable system (pump 30 m)", () => {
    const profile = computePiezometricProfile({
      nodes: net.nodes,
      pipes: net.pipes,
      settings: SETTINGS,
      pumpHeadM: 30,
    });
    const last = profile.points[profile.points.length - 1]!;
    expect(last.availableDPM).toBeGreaterThanOrEqual(5);
  });

  it("supply head is monotone decreasing along the path", () => {
    const profile = computePiezometricProfile({
      nodes: net.nodes,
      pipes: net.pipes,
      settings: SETTINGS,
      pumpHeadM: 30,
    });
    for (let i = 1; i < profile.points.length; i += 1) {
      expect(profile.points[i]!.supplyHeadM).toBeLessThanOrEqual(profile.points[i - 1]!.supplyHeadM);
    }
  });

  it("return head is monotone increasing along the path (walked source → consumer)", () => {
    const profile = computePiezometricProfile({
      nodes: net.nodes,
      pipes: net.pipes,
      settings: SETTINGS,
      pumpHeadM: 30,
    });
    for (let i = 1; i < profile.points.length; i += 1) {
      expect(profile.points[i]!.returnHeadM).toBeGreaterThanOrEqual(profile.points[i - 1]!.returnHeadM);
    }
  });

  // ───────────────────────────────────────────────────────────────
  // Phase 5D.3 — supply-temperature overlay on the piezometric profile.
  // ───────────────────────────────────────────────────────────────

  it("Phase 5D.3: supplyTemp_C is undefined when no temp map is passed", () => {
    const profile = computePiezometricProfile({
      nodes: net.nodes,
      pipes: net.pipes,
      settings: SETTINGS,
      pumpHeadM: 30,
    });
    for (const pt of profile.points) {
      expect(pt.supplyTemp_C).toBeUndefined();
    }
  });

  it("Phase 5D.3: supplyTemp_C is populated when temp map is passed (object form)", () => {
    // Mock temp drop along the path: 95 -> 94 -> 93 etc, one degree
    // per node. The piezometric module just looks them up, doesn't
    // compute them — caller (PiezometricView) hands them in from
    // runFullCalc's results.
    const tempMap: Record<string, number> = {};
    for (let i = 0; i < net.nodes.length; i += 1) {
      tempMap[net.nodes[i]!.id] = 95 - i;
    }
    const profile = computePiezometricProfile({
      nodes: net.nodes,
      pipes: net.pipes,
      settings: SETTINGS,
      pumpHeadM: 30,
      supplyTempByNodeId: tempMap,
    });
    // Every walked point should now carry a temp.
    for (const pt of profile.points) {
      expect(pt.supplyTemp_C).toBeDefined();
      expect(pt.supplyTemp_C).toBeLessThanOrEqual(95);
    }
    // First point is the source — should be exactly 95.
    expect(profile.points[0]!.supplyTemp_C).toBe(95);
    // Last point should be cooler than the source (walked downstream).
    const last = profile.points[profile.points.length - 1]!;
    expect(last.supplyTemp_C!).toBeLessThan(95);
  });

  it("Phase 5D.3: supplyTempByNodeId accepts a Map<string, number> too", () => {
    const tempMap = new Map<string, number>();
    for (let i = 0; i < net.nodes.length; i += 1) {
      tempMap.set(net.nodes[i]!.id, 95 - i * 0.5);
    }
    const profile = computePiezometricProfile({
      nodes: net.nodes,
      pipes: net.pipes,
      settings: SETTINGS,
      pumpHeadM: 30,
      supplyTempByNodeId: tempMap,
    });
    expect(profile.points[0]!.supplyTemp_C).toBe(95);
    const last = profile.points[profile.points.length - 1]!;
    expect(last.supplyTemp_C!).toBeLessThan(95);
  });
});
