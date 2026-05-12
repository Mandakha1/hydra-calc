/**
 * Phase 5B.1d — GK-23/02 fixture Haversine sanity.
 *
 * What this catches:
 *   The fixture's x/y coordinates are in metres relative to the
 *   Songinokhairkhan 34th khoroo origin recorded in _meta.geo_origin.
 *   Each node now carries an explicit `lat` / `lon` derived from
 *   that origin (committed alongside this test). If anyone in the
 *   future:
 *     - moves the geo origin without re-running the lat/lon derivation
 *     - changes a node's x/y without updating its lat/lon
 *     - introduces a Pythagoras-vs-Haversine bug at small distances
 *   …then the Haversine distance between fromNode and toNode will
 *   diverge from the fixture's explicit `length_m` field, and this
 *   test will fail with a clear node-pair diff.
 *
 *   Within engineering tolerance (±0.5 m) is a 99.5 % match — the
 *   only drift comes from the fixture's lat/lon being persisted to
 *   7 decimal places (≈ 1 cm precision) and the original x/y values
 *   being integers (1 m precision).
 */
import { describe, it, expect } from "vitest";
import { loadGKFixtureV2 } from "./_helpers/loadGKFixture";
import { haversineMeters } from "../haversine";

describe("GK-23/02 fixture — Haversine pipe-length sanity (Phase 5B.1d)", () => {
  const f = loadGKFixtureV2();
  // Supply + return pipes follow straight-line trench routes between
  // chambers, so their length_m should match the great-circle distance.
  // HW pipes (P015-HW-S/-R, P016-HW-S/-R) share the heating trench but
  // run a shorter as-built length — their length_m is a routing figure
  // that intentionally diverges from the cartesian distance. Excluded
  // from the geometric sanity to keep the assertion meaningful.
  const geometricPipes = [...f.heatingSupplyPipes, ...f.heatingReturnPipes];

  it("every node has a `geo` position (lat/lon set from fixture origin)", () => {
    // Catches the regression where someone strips lat/lon from the
    // fixture or the adapter forgets to copy it through.
    for (const n of f.nodes) {
      expect(n.geo, `node ${n.id} is missing geo`).toBeDefined();
      expect(n.geo!.lat).toBeGreaterThan(47);
      expect(n.geo!.lat).toBeLessThan(48);
      expect(n.geo!.lon).toBeGreaterThan(106);
      expect(n.geo!.lon).toBeLessThan(108);
    }
  });

  it("Haversine length matches fixture's length_m within ±0.5 m on every geometric pipe", () => {
    // The fixture's length_m values are integers (1 m precision). The
    // Haversine of the lat/lon derivation should land within half a
    // metre on every pipe — proves the round-trip cartesian → geo →
    // great-circle is self-consistent for trench-routed supply + return
    // pipes. HW pipes are excluded above (their length_m is routing
    // rather than geometric).
    let worstDeltaM = 0;
    let worstPipeId = "";
    for (const pipe of geometricPipes) {
      const from = f.nodes.find((n) => n.id === pipe.fromNodeId);
      const to = f.nodes.find((n) => n.id === pipe.toNodeId);
      expect(from?.geo).toBeDefined();
      expect(to?.geo).toBeDefined();
      const hav = haversineMeters(from!.geo!, to!.geo!);
      const delta = Math.abs(hav - pipe.length_m);
      if (delta > worstDeltaM) {
        worstDeltaM = delta;
        worstPipeId = pipe.id;
      }
      expect(
        delta,
        `pipe ${pipe.id}: Haversine=${hav.toFixed(3)} m, fixture length_m=${pipe.length_m}`,
      ).toBeLessThan(0.5);
    }
    // Smoke print so anyone watching the suite sees the actual worst
    // drift each run — engineering-correctness witness.
    // eslint-disable-next-line no-console
    console.log(
      `[fixture-haversine] worst pipe-length drift: ${worstDeltaM.toFixed(3)} m on ${worstPipeId}`,
    );
  });

  it("longest-path pipes sum to fixture's documented total_length_m", () => {
    // Sanity for the magistral leg, cross-checked against the fixture's
    // expected_results_full_network.longest_path. If lat/lon-derived
    // Haversine sums diverge from the documented 390 m we'd see it
    // here even when individual pipes pass.
    const legIds = ["P001-S","P002-S","P004-S","P005-S","P006-S","P007-S","P009-S","P011-S","P012-S","P013-S"];
    let havTotal = 0;
    for (const id of legIds) {
      const p = f.heatingSupplyPipes.find((x) => x.id === id)!;
      const from = f.nodes.find((n) => n.id === p.fromNodeId)!;
      const to = f.nodes.find((n) => n.id === p.toNodeId)!;
      havTotal += haversineMeters(from.geo!, to.geo!);
    }
    expect(havTotal).toBeGreaterThan(389);
    expect(havTotal).toBeLessThan(391);
  });
});
