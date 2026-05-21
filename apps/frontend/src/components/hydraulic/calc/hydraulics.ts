/**
 * Core hydraulic calculations.
 *
 * Pressure drop:
 *   Darcy–Weisbach:   ΔP = λ · (L/d) · (ρ v² / 2)                  [Pa]
 *   Colebrook–White:  1/√λ = −2·log₁₀(k/(3.7d) + 2.51/(Re·√λ))
 *
 * Mass flow from heat load:
 *   G = Q / (c_p · ΔT)   kg/s    (c_p = 4187 J/kg·K)
 *
 * Pump duty:
 *   H = ΔP_total / (ρ · g)        [m water column]
 *   Q = G / ρ · 3600              [m³/h]
 *   P_kW = ρ g Q_m3s H / η_pump
 */
import {
  PIPE_MATERIALS,
  PIPE_DB,
  WATER_PROPS,
  TEMP_SCHEDULES,
  NORM_THRESHOLDS,
} from "shared";
import type {
  SchemeNode,
  SchemePipe,
  ProjectSettings,
  PipeResult,
  NodeResult,
  CalculationResults,
} from "../hydraulicTypes";
import type { PipeLaying } from "../nodeCatalog";
import { pipeLengthFromGeometry } from "./haversine";
import {
  computePipeHeatLoss,
  K_PUR_FOAM_FRESH_W_MK,
  type Installation,
} from "./pipeHeatLoss";
import { INSULATION_TYPES } from "./heatLosses";

const GRAVITY = 9.81;
const C_P = WATER_PROPS.specific_heat_j_kg_k;
const PUMP_EFFICIENCY_DEFAULT = 0.65;

function waterDensity(t_c: number): number {
  const map = WATER_PROPS.density_kg_m3;
  const rounded = Math.round(t_c / 5) * 5;
  const key = `at_${rounded}c` as keyof typeof map;
  return map[key] ?? 972;
}

function waterViscosity(t_c: number): number {
  const map = WATER_PROPS.kinematic_viscosity_m2_s;
  if (t_c <= 30) return map.at_20c;
  if (t_c <= 50) return map.at_40c;
  if (t_c <= 75) return map.at_70c;
  if (t_c <= 90) return map.at_80c;
  if (t_c <= 110) return map.at_95c;
  return map.at_130c;
}

function pickPipeSize(category: ProjectSettings["primaryMaterialCategory"], dn: number) {
  const table = PIPE_DB[category];
  return table.find((p) => p.dn === dn) ?? table[0]!;
}

function materialRoughness(materialKey: string): number {
  return PIPE_MATERIALS.find((m) => m.key === materialKey)?.roughness_mm ?? 0.5;
}

/**
 * Solve Colebrook–White for λ (Darcy friction factor) by fixed-point iteration.
 * 50 iters, 1e-8 tolerance — matches the engineering convention from the spec.
 */
export function colebrookLambda(reynolds: number, relativeRoughness: number): { lambda: number; iterations: number } {
  if (reynolds < 2300) {
    // Laminar — Hagen-Poiseuille.
    return { lambda: 64 / Math.max(1, reynolds), iterations: 0 };
  }
  // Swamee–Jain initial guess
  let lambda =
    0.25 /
    Math.pow(
      Math.log10(relativeRoughness / 3.7 + 5.74 / Math.pow(reynolds, 0.9)),
      2,
    );
  for (let i = 1; i <= 50; i += 1) {
    const rhs = -2 * Math.log10(relativeRoughness / 3.7 + 2.51 / (reynolds * Math.sqrt(lambda)));
    const newLambda = 1 / (rhs * rhs);
    if (Math.abs(newLambda - lambda) < 1e-8) return { lambda: newLambda, iterations: i };
    lambda = newLambda;
  }
  return { lambda, iterations: 50 };
}

/**
 * Resolve a pipe's effective length used by the solver.
 *
 * Phase 5B.1c — when both endpoints carry geo coords, the Haversine
 * great-circle distance is the engineering truth; the stored
 * length_m is auto-derived from it. When only one endpoint (or
 * neither) has geo, the manual length_m is used.
 *
 * The `lengthSource` flag is surfaced on `PipeResult` so the UI can
 * indicate which path was taken — engineers see at a glance whether
 * a length is geometry-locked or manually overridden.
 */
function resolvePipeLength(
  pipe: SchemePipe,
  nodeById: Map<string, SchemeNode>,
): { length_m: number; source: "geometry" | "manual" } {
  const from = nodeById.get(pipe.fromNodeId);
  const to = nodeById.get(pipe.toNodeId);
  // Phase 13.39 — follow the bendpoints polyline, not just endpoint
  // straight-line. The engineer's corner detour around УДДТ /
  // building / chamber now adds to the hydraulic length the
  // pressure-drop solver consumes.
  const geoLength = pipeLengthFromGeometry(from, to, pipe.bendPoints);
  if (geoLength !== null && geoLength > 0) {
    return { length_m: geoLength, source: "geometry" };
  }
  return { length_m: pipe.length_m, source: "manual" };
}

/** Compute each pipe's flow, velocity, friction factor, and head loss.
 *
 * @param nodes Network nodes. Phase 5D — consumer heatLoad_w may be
 *   pre-scaled by the heat-loss correction factor so the
 *   downstream-load aggregation produces the correct ṁ at every pipe.
 * @param pipes Network pipes. Phase 5B.1c — length_m is used as a
 *   fallback when no geo coords are present.
 * @param settings Project settings.
 */
export function computePipeFlows(
  nodes: SchemeNode[],
  pipes: SchemePipe[],
  settings: ProjectSettings,
): PipeResult[] {
  const schedule = TEMP_SCHEDULES.find((t) => t.key === settings.temperatureScheduleKey) ?? TEMP_SCHEDULES[0]!;
  const deltaT = schedule.supply_c - schedule.return_c;
  const t_mean = (schedule.supply_c + schedule.return_c) / 2;
  const rho = waterDensity(t_mean);
  const nu = waterViscosity(t_mean);

  // 1. Compute mass flow at each pipe by summing downstream heat loads (tree topology).
  const downstreamLoad = computeDownstreamLoads(nodes, pipes);
  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  const results: PipeResult[] = [];
  for (const pipe of pipes) {
    const size = pickPipeSize(settings.primaryMaterialCategory, pipe.dn);
    const d_m = size.id_mm / 1000;
    const area = Math.PI * d_m * d_m * 0.25;

    const { length_m, source: lengthSource } = resolvePipeLength(pipe, nodeById);

    const load_w = downstreamLoad.get(pipe.id) ?? 0;
    const G = load_w > 0 ? load_w / (C_P * deltaT) : 0.001; // kg/s
    const v = G / (rho * area);
    const Re = (v * d_m) / nu;
    const k_m = (pipe.roughness_mm ?? materialRoughness(pipe.materialKey)) / 1000;
    const { lambda, iterations } = colebrookLambda(Re, k_m / d_m);
    const headlossPerMeter = lambda * (rho * v * v) / (2 * d_m); // Pa/m
    const localFactor = 1 + settings.localLossesFraction;
    const totalDp = headlossPerMeter * length_m * localFactor;

    results.push({
      pipeId: pipe.id,
      G_kg_s: G,
      v_m_s: v,
      Re,
      lambda,
      headlossPerMeter_pa: headlossPerMeter,
      totalPressureDrop_pa: totalDp,
      iterations,
      lengthSource,
    });
  }
  return results;
}

/**
 * Walk the network outward from source(s), accumulating downstream heat loads
 * at each edge (pipe) for flow estimation. Works on tree topologies.
 */
function computeDownstreamLoads(
  nodes: SchemeNode[],
  pipes: SchemePipe[],
): Map<string, number> {
  const loads = new Map<string, number>();
  const adj = new Map<string, SchemePipe[]>();
  for (const p of pipes) {
    if (!adj.has(p.fromNodeId)) adj.set(p.fromNodeId, []);
    adj.get(p.fromNodeId)!.push(p);
  }

  const nodeLoad = (n: SchemeNode) => n.heatLoad_w ?? 0;
  const memo = new Map<string, number>();

  function loadBelow(nodeId: string, visiting: Set<string>): number {
    if (memo.has(nodeId)) return memo.get(nodeId)!;
    if (visiting.has(nodeId)) return 0; // cycle guard
    visiting.add(nodeId);
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return 0;
    let sum = nodeLoad(node);
    for (const p of adj.get(nodeId) ?? []) {
      sum += loadBelow(p.toNodeId, visiting);
    }
    memo.set(nodeId, sum);
    return sum;
  }

  for (const pipe of pipes) {
    const load = loadBelow(pipe.toNodeId, new Set());
    loads.set(pipe.id, load);
  }
  return loads;
}

/** Compute pressure at each node from source outward. Returns MPa. */
export function computeNodePressures(
  nodes: SchemeNode[],
  pipes: SchemePipe[],
  pipeResults: PipeResult[],
  sourcePressure_mpa: number,
): NodeResult[] {
  const pressure = new Map<string, number>();
  const sources = nodes.filter((n) => n.kind === "source");
  const source = sources[0];
  if (source) pressure.set(source.id, sourcePressure_mpa);
  else if (nodes[0]) pressure.set(nodes[0].id, sourcePressure_mpa);

  const resultByPipe = new Map(pipeResults.map((r) => [r.pipeId, r]));
  const adj = new Map<string, SchemePipe[]>();
  for (const p of pipes) {
    if (!adj.has(p.fromNodeId)) adj.set(p.fromNodeId, []);
    adj.get(p.fromNodeId)!.push(p);
  }

  const queue = [...pressure.keys()];
  const visited = new Set<string>(queue);
  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    const currentP = pressure.get(nodeId)!;
    for (const pipe of adj.get(nodeId) ?? []) {
      if (visited.has(pipe.toNodeId)) continue;
      const result = resultByPipe.get(pipe.id);
      if (!result) continue;
      const drop_mpa = result.totalPressureDrop_pa / 1e6;
      const elevationDrop_mpa = elevationHead(nodes, pipe);
      const p_next = currentP - drop_mpa - elevationDrop_mpa;
      pressure.set(pipe.toNodeId, p_next);
      visited.add(pipe.toNodeId);
      queue.push(pipe.toNodeId);
    }
  }

  return nodes.map((n) => ({
    nodeId: n.id,
    pressureAtNode_mpa: pressure.get(n.id) ?? 0,
    heatLoad_w: n.heatLoad_w ?? 0,
  }));
}

function elevationHead(nodes: SchemeNode[], pipe: SchemePipe): number {
  const a = nodes.find((n) => n.id === pipe.fromNodeId)?.elevation_m;
  const b = nodes.find((n) => n.id === pipe.toNodeId)?.elevation_m;
  if (a === undefined || b === undefined) return 0;
  // ρ g Δh (Pa) → MPa. Use ρ=970 at average water temp.
  return ((b - a) * 970 * GRAVITY) / 1e6;
}

/**
 * Resolve the installation type for a pipe.
 *
 * Phase 5D — drives the ambient temperature used by the heat-loss
 * calculation. The pipe's own `laying` field wins; otherwise falls
 * back to the project-level `defaultLaying`; otherwise the Mongolian
 * residential default ("underground_channel" — concrete trench).
 */
function pipeInstallation(
  pipe: SchemePipe,
  settings: ProjectSettings,
): Installation {
  const laying: PipeLaying =
    pipe.laying ?? settings.defaultLaying ?? "underground_channel";
  switch (laying) {
    case "above_ground":
      return "air";
    case "underground_channelless":
      return "buried";
    case "underground_channel":
    case "lotok":
    case "indoor":
    default:
      return "channel";
  }
}

/** Resolve the ambient temperature for a pipe given its installation. */
function pipeAmbientTemp(
  installation: Installation,
  settings: ProjectSettings,
): number {
  switch (installation) {
    case "air":
      return settings.designOutdoorTemp_c ?? -39;
    case "channel":
      return settings.channelAmbientTemp_c ?? 10;
    case "buried":
      return settings.soilTempWinter_c ?? 5;
  }
}

/** Resolve insulation conductivity for a pipe. */
function pipeInsulationK(
  pipe: SchemePipe,
  settings: ProjectSettings,
): number {
  const key = pipe.insulationKey ?? settings.defaultInsulationKey ?? "pur_pi";
  const found = INSULATION_TYPES.find((i) => i.key === key);
  return found?.lambda_w_m_k ?? K_PUR_FOAM_FRESH_W_MK;
}

/**
 * Phase 5D — compute per-pipe heat loss (W/m) for the network at a
 * uniform supply temperature. The result is used in the temperature-
 * propagation pass to find the consumer inlet temps.
 */
function computeHeatLossPerPipe(
  pipes: SchemePipe[],
  supplyTemp_C: number,
  settings: ProjectSettings,
): Map<string, number> {
  const result = new Map<string, number>();
  for (const pipe of pipes) {
    const size = pickPipeSize(settings.primaryMaterialCategory, pipe.dn);
    const installation = pipeInstallation(pipe, settings);
    const ambient = pipeAmbientTemp(installation, settings);
    const ins_thk =
      pipe.insulationThickness_mm ??
      settings.defaultInsulationThickness_mm ??
      50;
    const ins_k = pipeInsulationK(pipe, settings);
    try {
      const r = computePipeHeatLoss({
        fluidTemp_C: supplyTemp_C,
        ambientTemp_C: ambient,
        pipeOuterDiameter_mm: size.od_mm,
        pipeWallThickness_mm: size.wall_mm,
        insulationThickness_mm: ins_thk,
        insulationConductivity_W_mK: ins_k,
        installation,
        burialDepth_m: pipe.burialDepth_m ?? 1.5,
      });
      result.set(pipe.id, r.heatLossPerMeter_W);
    } catch {
      // If inputs are out of physical bounds (e.g. invalid burial
      // depth), skip the pipe — it just contributes zero heat loss.
      // The error is informational only; the solver remains usable.
      result.set(pipe.id, 0);
    }
  }
  return result;
}

/**
 * Phase 5D — walk the supply tree from source to every reachable
 * node, accumulating temperature drop along the path. Heat loss in
 * each segment cools the fluid by q'·L / (ṁ·c_p).
 *
 * Records temperature at EVERY node touched (chambers + consumers),
 * not just consumers — the piezometric chart and downstream UI use
 * the chamber temps to draw the supply-temperature profile along
 * the magistral.
 */
function computeNodeSupplyTemps(
  nodes: SchemeNode[],
  pipes: SchemePipe[],
  pipeResults: PipeResult[],
  heatLossPerPipe: Map<string, number>,
  sourceTemp_C: number,
  nodeById: Map<string, SchemeNode>,
): Map<string, number> {
  const nodeT = new Map<string, number>();
  const sourceId =
    nodes.find((n) => n.kind === "source")?.id ?? nodes[0]?.id;
  if (!sourceId) return nodeT;

  const supplyPipes = pipes.filter(
    (p) => !p.circuit || p.circuit === "heating_supply",
  );
  const adj = new Map<string, SchemePipe[]>();
  for (const p of supplyPipes) {
    if (!adj.has(p.fromNodeId)) adj.set(p.fromNodeId, []);
    adj.get(p.fromNodeId)!.push(p);
  }
  const resultByPipe = new Map(pipeResults.map((r) => [r.pipeId, r]));

  const walk = (id: string, T_C: number, visited: Set<string>) => {
    if (visited.has(id)) return;
    visited.add(id);
    // First time we reach this node wins (tree topology — there's
    // only one path source → node in a directed supply tree).
    if (!nodeT.has(id)) nodeT.set(id, T_C);
    for (const p of adj.get(id) ?? []) {
      const q_per_m = heatLossPerPipe.get(p.id) ?? 0;
      const length_m = resolvePipeLength(p, nodeById).length_m;
      const segLoss_W = q_per_m * length_m;
      const G = resultByPipe.get(p.id)?.G_kg_s ?? 0;
      const dT = G > 1e-6 ? segLoss_W / (G * C_P) : 0;
      walk(p.toNodeId, T_C - dT, new Set(visited));
    }
  };
  walk(sourceId, sourceTemp_C, new Set());
  return nodeT;
}

export function runFullCalc(
  nodes: SchemeNode[],
  pipes: SchemePipe[],
  settings: ProjectSettings,
): CalculationResults {
  const schedule =
    TEMP_SCHEDULES.find((t) => t.key === settings.temperatureScheduleKey) ??
    TEMP_SCHEDULES[0]!;
  const supplyT = schedule.supply_c;
  const returnT = schedule.return_c;
  const designDeltaT = supplyT - returnT;

  // -------- PASS 1: baseline (no heat loss) -----------------------
  // Compute pipe flows assuming the consumer sees the full design ΔT.
  // This gives us a first-cut mass flow per pipe — accurate enough to
  // drive the heat-loss pass, even though the actual ṁ will grow
  // 5-12% on far consumers after correction.
  let pipeResults = computePipeFlows(nodes, pipes, settings);

  // -------- PHASE 5D: heat-loss-aware fixed-point iteration --------
  let heatLossPerPipe = new Map<string, number>();
  let nodeSupplyT = new Map<string, number>();
  let totalHeatLoss_W = 0;
  const heatLossEnabled = settings.heatLossEnabled !== false;
  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  if (heatLossEnabled) {
    // Step 1 — heat loss per pipe at uniform supply T (first pass).
    heatLossPerPipe = computeHeatLossPerPipe(pipes, supplyT, settings);

    // Step 2 — temperature drop from source to each consumer using
    // baseline pipe mass flows.
    nodeSupplyT = computeNodeSupplyTemps(
      nodes,
      pipes,
      pipeResults,
      heatLossPerPipe,
      supplyT,
      nodeById,
    );

    // Step 3 — adjust consumer effective ΔT. A consumer that sees
    // T_inlet = 93 °C instead of 95 °C has 23 °C usable ΔT instead
    // of 25, so it needs (25/23) × baseline mass flow to deliver the
    // same heat. We re-scale each consumer's heatLoad_w by that
    // factor so the downstream-load aggregator produces the right ṁ
    // automatically.
    const adjustedNodes = nodes.map((n) => {
      if (n.kind !== "consumer" || !n.heatLoad_w) return n;
      const T_inlet = nodeSupplyT.get(n.id);
      if (T_inlet === undefined) return n;
      const effectiveDeltaT = T_inlet - returnT;
      // Guard against pathological networks where heat loss exceeds
      // the entire ΔT — would otherwise scale to infinity.
      if (effectiveDeltaT <= 0.1) return n;
      const scale = designDeltaT / effectiveDeltaT;
      return { ...n, heatLoad_w: n.heatLoad_w * scale };
    });

    // Step 4 — re-run pipe flows with adjusted loads. One fixed-point
    // iteration is enough: heat loss changes by < 0.5 % when the new
    // (slightly higher) flows are fed back, far below engineering
    // tolerance.
    pipeResults = computePipeFlows(adjustedNodes, pipes, settings);

    // Recompute supply temps with the new flows — same pipe q' (the
    // local supply T is still close to design), but the per-pipe ṁ
    // is now larger, so the ΔT contribution per pipe is slightly
    // smaller. This is what reaches the UI / norm check.
    nodeSupplyT = computeNodeSupplyTemps(
      nodes, // original nodes — we want the user-visible heatLoad_w
      pipes,
      pipeResults,
      heatLossPerPipe,
      supplyT,
      nodeById,
    );

    // Total network heat loss = Σ q'_i · L_i.
    for (const pipe of pipes) {
      const q_per_m = heatLossPerPipe.get(pipe.id) ?? 0;
      const length_m = resolvePipeLength(pipe, nodeById).length_m;
      totalHeatLoss_W += q_per_m * length_m;
    }
  }

  // Annotate pipe results with heat-loss per metre for downstream
  // consumers (UI breakdown, Excel export, piezometric chart).
  const annotatedPipes: PipeResult[] = pipeResults.map((r) => ({
    ...r,
    heatLossPerMeter_W: heatLossPerPipe.get(r.pipeId),
  }));

  const nodeResults = computeNodePressures(
    nodes,
    pipes,
    annotatedPipes,
    settings.sourcePressure_mpa,
  ).map((nr) => ({
    ...nr,
    supplyTemp_C_at_inlet: nodeSupplyT.get(nr.nodeId),
  }));

  const totalLoad = nodes.reduce((s, n) => s + (n.heatLoad_w ?? 0), 0);
  const maxR = annotatedPipes.reduce(
    (m, p) => Math.max(m, p.headlossPerMeter_pa),
    0,
  );
  const maxV = annotatedPipes.reduce((m, p) => Math.max(m, p.v_m_s), 0);

  const consumerPressures = nodeResults
    .filter((n) => nodes.find((x) => x.id === n.nodeId)?.kind === "consumer")
    .map((n) => n.pressureAtNode_mpa);
  const minConsumerP = consumerPressures.length
    ? Math.min(...consumerPressures)
    : 0;

  const pump = sizePump(nodes, pipes, annotatedPipes, settings);

  let heatLoss: CalculationResults["heatLoss"] | undefined;
  if (heatLossEnabled) {
    // minConsumerSupplyTemp_C is the worst consumer's inlet — filter
    // to consumer nodes only so a deep chamber on a long magistral
    // doesn't undercut the metric for the actual end users.
    const consumerOnlyTemps: number[] = [];
    for (const n of nodes) {
      if (n.kind === "consumer") {
        const t = nodeSupplyT.get(n.id);
        if (typeof t === "number") consumerOnlyTemps.push(t);
      }
    }
    heatLoss = {
      totalHeatLoss_W,
      fractionOfLoad: totalLoad > 0 ? totalHeatLoss_W / totalLoad : 0,
      minConsumerSupplyTemp_C: consumerOnlyTemps.length
        ? Math.min(...consumerOnlyTemps)
        : supplyT,
      sourceSupplyTemp_C: supplyT,
    };
  }

  return {
    pipes: annotatedPipes,
    nodes: nodeResults,
    totalLoad_w: totalLoad,
    maxHeadlossPerMeter_pa: maxR,
    maxVelocity_m_s: maxV,
    minConsumerPressure_mpa: minConsumerP,
    pump,
    heatLoss,
    computedAt: new Date().toISOString(),
  };
}

/**
 * Compute required pump head + flow + power for a 2-pipe heat network.
 *
 * Per БНбД 41-01-2019 §6.3 / СП 124.13330.2012 §7.4, the pump must
 * overcome the friction along the WORST-served consumer's full loop
 * (supply leg + return leg) AND still deliver the 0.15 MPa Δp the
 * consumer needs at its ИТП inlet:
 *
 *   H_required = (ΔP_supply_max + ΔP_return_max) / (ρ·g)
 *              + Δp_consumer_reserve / (ρ·g)
 *
 * Until this function was fixed (DISCREPANCY-002, Phase 5A), only the
 * supply-leg term was counted — under-sizing the pump by ~4-5 % on a
 * balanced 2-pipe system. That is enough to stall the return loop at
 * the far consumer during −39 °C peak Mongolian winter, leaving cold
 * radiators in the last building on the line. The current
 * implementation walks BOTH supply and return circuits when present;
 * if no return pipes are passed (synthetic supply-only test networks),
 * it assumes the balanced-2-pipe mirror (return ΔP = supply ΔP).
 *
 * A 2 m design safety margin is surfaced in `breakdown.safetyMargin_m`
 * so the UI can show "minimum required" (H_m) and "recommended" (H_m +
 * margin) side-by-side; the margin is NOT folded into H_m itself so
 * the value matches the fixture's `H_m_minimum_required`.
 */
const DESIGN_SAFETY_MARGIN_M = 2;

function sizePump(
  nodes: SchemeNode[],
  pipes: SchemePipe[],
  pipeResults: PipeResult[],
  settings: ProjectSettings,
) {
  const sourceId = nodes.find((n) => n.kind === "source")?.id ?? nodes[0]?.id;
  if (!sourceId) return undefined;

  // Partition pipes by circuit so supply-tree and return-tree are walked
  // independently. heating_supply is the directed tree from the source;
  // heating_return points the OTHER way (consumer → source).
  const supplyPipes = pipes.filter((p) => !p.circuit || p.circuit === "heating_supply");
  const returnPipes = pipes.filter((p) => p.circuit === "heating_return");

  const supplyAdj = new Map<string, SchemePipe[]>();
  for (const p of supplyPipes) {
    if (!supplyAdj.has(p.fromNodeId)) supplyAdj.set(p.fromNodeId, []);
    supplyAdj.get(p.fromNodeId)!.push(p);
  }
  const returnAdj = new Map<string, SchemePipe[]>();
  for (const p of returnPipes) {
    if (!returnAdj.has(p.fromNodeId)) returnAdj.set(p.fromNodeId, []);
    returnAdj.get(p.fromNodeId)!.push(p);
  }
  const resultByPipe = new Map(pipeResults.map((r) => [r.pipeId, r]));

  // 1. Supply leg: cumulative friction from source to each consumer.
  const supplyDpByConsumer = new Map<string, number>();
  const dfsSupply = (id: string, accum: number, visited: Set<string>): void => {
    if (visited.has(id)) return;
    visited.add(id);
    const node = nodes.find((n) => n.id === id);
    if (node?.kind === "consumer") supplyDpByConsumer.set(id, accum);
    for (const p of supplyAdj.get(id) ?? []) {
      const r = resultByPipe.get(p.id);
      if (!r) continue;
      dfsSupply(p.toNodeId, accum + r.totalPressureDrop_pa, new Set(visited));
    }
  };
  dfsSupply(sourceId, 0, new Set());

  // 2. Return leg: cumulative friction from each consumer back to source.
  // If no return pipes were supplied (synthetic supply-only network),
  // fall back to the balanced-2-pipe assumption (return ΔP ≈ supply ΔP).
  const returnDpByConsumer = new Map<string, number>();
  if (returnPipes.length > 0) {
    for (const [consumerId] of supplyDpByConsumer) {
      let total = 0;
      const walk = (id: string, accum: number, visited: Set<string>): void => {
        if (visited.has(id)) return;
        visited.add(id);
        if (id === sourceId) {
          total = Math.max(total, accum);
          return;
        }
        for (const p of returnAdj.get(id) ?? []) {
          const r = resultByPipe.get(p.id);
          if (!r) continue;
          walk(p.toNodeId, accum + r.totalPressureDrop_pa, new Set(visited));
        }
      };
      walk(consumerId, 0, new Set());
      returnDpByConsumer.set(consumerId, total);
    }
  } else {
    for (const [consumerId, supplyDp] of supplyDpByConsumer) {
      returnDpByConsumer.set(consumerId, supplyDp);
    }
  }

  // 3. Pick the consumer with the worst (supply + return) friction loop
  //    — that's the one driving pump sizing.
  let worstSupplyDp_pa = 0;
  let worstReturnDp_pa = 0;
  for (const [consumerId, supplyDp] of supplyDpByConsumer) {
    const retDp = returnDpByConsumer.get(consumerId) ?? supplyDp;
    if (supplyDp + retDp > worstSupplyDp_pa + worstReturnDp_pa) {
      worstSupplyDp_pa = supplyDp;
      worstReturnDp_pa = retDp;
    }
  }

  const reserveDp_pa = NORM_THRESHOLDS.dp_consumer_min_mpa * 1e6;

  const schedule = TEMP_SCHEDULES.find((t) => t.key === settings.temperatureScheduleKey) ?? TEMP_SCHEDULES[0]!;
  const t_mean = (schedule.supply_c + schedule.return_c) / 2;
  const rho = waterDensity(t_mean);
  const denom = rho * GRAVITY;

  // Per-component breakdown in metres of water — surfaced to UI for
  // engineer-readable pump-sizing rationale.
  const supplyFriction_m = worstSupplyDp_pa / denom;
  const returnFriction_m = worstReturnDp_pa / denom;
  const consumerReserve_m = reserveDp_pa / denom;
  const safetyMargin_m = DESIGN_SAFETY_MARGIN_M;

  // Minimum required H — matches fixture's H_m_minimum_required.
  // safetyMargin_m is left out of H_m and surfaced separately so the
  // UI can present "minimum" and "recommended (with 2 m margin)".
  const H_m = supplyFriction_m + returnFriction_m + consumerReserve_m;

  const totalG = pipeResults.reduce((max, r) => Math.max(max, r.G_kg_s), 0);
  const Q_m3s = totalG / rho;
  const Q_m3h = Q_m3s * 3600;
  const P_kW = (denom * Q_m3s * H_m) / PUMP_EFFICIENCY_DEFAULT / 1000;

  return {
    H_m,
    Q_m3h,
    P_kW,
    breakdown: {
      supplyFriction_m,
      returnFriction_m,
      consumerReserve_m,
      safetyMargin_m,
    },
  };
}
