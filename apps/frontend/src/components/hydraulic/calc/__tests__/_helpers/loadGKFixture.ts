/**
 * GK-23/02 fixture adapter — maps the JSON-on-disk shape to the
 * production hydraulic store's SchemeNode / SchemePipe / ProjectSettings.
 *
 * Lives inside the frontend's calc/__tests__ folder so it can import the
 * solver directly and is covered by `pnpm --filter frontend typecheck`.
 * The fixture JSON itself stays at the repo-root `tests/fixtures/` so
 * it's discoverable from other workspaces too.
 *
 * Engineering decisions encoded here (all defensible per the v2 fixture
 * comment block + the solver's known capabilities):
 *
 *   1. The fixture has 4 HW pipes (P015/P016 -S/-R) that form a SECOND
 *      circuit parallel to the heating supply. The production solver's
 *      computeDownstreamLoads() walks a directed tree from each source
 *      outward, so a parallel HW path to AOS-3/AOS-5 would double-count
 *      consumer load. We therefore expose HW pipes separately and run the
 *      heating circuit on its own tree.
 *
 *   2. Return pipes (P001-R … P014-R) carry the same mass flow and have
 *      the same DN as their supply counterparts, so they share the
 *      identical (G, v, Re, λ, R, ΔP) tuple. We therefore run the solver
 *      on the supply tree only and look up the matching supply pipe's
 *      result whenever a return-pipe assertion is checked. This avoids
 *      having to teach the solver about return-circuit direction reversal.
 *
 *   3. Node types `well | fixed_support | elbow | compensator` all map to
 *      `kind: "chamber"` — pass-through nodes that contribute zero heat
 *      load (the solver treats anything that isn't `kind: "consumer"` as
 *      a non-consumer for downstream-load aggregation).
 *
 *   4. Source node maps to literal `kind: "source"` (NOT `source_substation`)
 *      because hydraulics.ts:179/262 uses strict-equality `kind === "source"`
 *      for source detection.
 */
import fixtureRaw from "../../../../../../../../tests/fixtures/real_project_001_v2.json";
import type { SchemeNode, SchemePipe, ProjectSettings } from "../../../hydraulicTypes";

export const fixture = fixtureRaw;

export interface LoadedFixture {
  /** Mapped network: source + 5 consumers + 8 pass-through junctions. */
  nodes: SchemeNode[];
  /** ONLY heating supply pipes — 14 of them, forming a directed tree
   *  from the source out to every consumer. This is what the solver
   *  can consume directly. */
  heatingSupplyPipes: SchemePipe[];
  /** ONLY heating return pipes — 14 of them. Not fed to the solver
   *  (would create cycles). Test code looks up the matching supply
   *  pipe's computed result for each of these. */
  heatingReturnPipes: SchemePipe[];
  /** HW pipes — 4 of them (2 pairs). Out of scope for the current
   *  heating-tree solver; tests can validate them analytically via the
   *  fixture's published expected_results. */
  hwPipes: SchemePipe[];
  /** Project settings — temperature graph + material defaults. */
  settings: ProjectSettings;
}

/**
 * Returns the v2 fixture adapted to the production hydraulic-store
 * shape, with heating / return / HW pipes pre-partitioned per the
 * solver's known capabilities (see file header for rationale).
 */
export function loadGKFixtureV2(): LoadedFixture {
  const nodes: SchemeNode[] = fixtureRaw.nodes.map((n) => {
    let kind: string;
    if (n.type === "source") kind = "source";
    else if (n.type === "consumer") kind = "consumer";
    else kind = "chamber"; // well, fixed_support, elbow, compensator → pass-through

    const loadW = (n as { load_W?: number }).load_W;
    const geoRaw = n as { lat?: number; lon?: number };
    return {
      id: n.id,
      kind,
      label: n.id,
      x: n.x,
      y: n.y,
      // Phase 5B.1d — fixture nodes carry lat/lon derived from a fixed
      // Songinokhairkhan-centre origin (see _meta.geo_origin). The
      // adapter surfaces them as `geo` so Haversine can sanity-check
      // pipe length_m against the great-circle distance.
      geo:
        typeof geoRaw.lat === "number" && typeof geoRaw.lon === "number"
          ? { lat: geoRaw.lat, lon: geoRaw.lon }
          : undefined,
      heatLoad_w: loadW,
      requiredPressure_mpa: kind === "consumer" ? 0.15 : kind === "source" ? 0.6 : undefined,
      elevation_m: n.elevation_m,
    } satisfies SchemeNode;
  });

  function mapPipe(p: typeof fixtureRaw.pipes[number]): SchemePipe {
    let circuit: SchemePipe["circuit"];
    switch (p.role) {
      case "supply": circuit = "heating_supply"; break;
      case "return": circuit = "heating_return"; break;
      case "hw_supply": circuit = "dhw_supply"; break;
      case "hw_return": circuit = "dhw_recirc"; break;
      default: circuit = "heating_supply";
    }
    return {
      id: p.id,
      fromNodeId: p.from,
      toNodeId: p.to,
      // ε=0.0001 m in the fixture matches steel_new (k_e=0.1 mm).
      materialKey: "steel_new",
      dn: p.dn,
      length_m: p.length_m,
      circuit,
    };
  }

  const heatingSupplyPipes = fixtureRaw.pipes.filter((p) => p.role === "supply").map(mapPipe);
  const heatingReturnPipes = fixtureRaw.pipes.filter((p) => p.role === "return").map(mapPipe);
  const hwPipes = fixtureRaw.pipes.filter((p) => p.role === "hw_supply" || p.role === "hw_return").map(mapPipe);

  const settings: ProjectSettings = {
    networkType: "two_pipe_closed",
    temperatureScheduleKey: "95_70",
    designOutdoorTemp_c: fixtureRaw.climate.design_outdoor_temp_C,
    city: "ulaanbaatar",
    // GK-23/02 paperwork explicitly cites "GOST 10704-91 V-group" (DN = OD,
    // wall = 2.5 mm) — we route the solver through the matching pipe table.
    primaryMaterialCategory: "steel_v_group",
    // The fixture generated expected per-pipe values with 0 local losses
    // (pure Darcy-Weisbach friction). We mirror that so program output
    // matches the fixture rather than including a 30 % local-loss bump.
    localLossesFraction: 0,
    sourcePressure_mpa: 0.6,
    // Phase 5D — the fixture's expected G / v / R values were computed
    // assuming a uniform 25 °C ΔT across the network (no insulation
    // heat loss). Disable the heat-loss pass so the solver's math
    // matches the fixture's math exactly. A separate test
    // (heatLossIntegration.test.ts) exercises the heat-loss-enabled
    // path against the same fixture topology.
    heatLossEnabled: false,
  };

  return { nodes, heatingSupplyPipes, heatingReturnPipes, hwPipes, settings };
}

/** Convenience: build the source+heating-only network the solver can
 *  ingest, in a single call. */
export function buildHeatingNetwork(): { nodes: SchemeNode[]; pipes: SchemePipe[]; settings: ProjectSettings } {
  const f = loadGKFixtureV2();
  return { nodes: f.nodes, pipes: f.heatingSupplyPipes, settings: f.settings };
}
