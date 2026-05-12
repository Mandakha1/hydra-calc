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

/** Compute each pipe's flow, velocity, friction factor, and head loss. */
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

  const results: PipeResult[] = [];
  for (const pipe of pipes) {
    const size = pickPipeSize(settings.primaryMaterialCategory, pipe.dn);
    const d_m = size.id_mm / 1000;
    const area = Math.PI * d_m * d_m * 0.25;

    const load_w = downstreamLoad.get(pipe.id) ?? 0;
    const G = load_w > 0 ? load_w / (C_P * deltaT) : 0.001; // kg/s
    const v = G / (rho * area);
    const Re = (v * d_m) / nu;
    const k_m = (pipe.roughness_mm ?? materialRoughness(pipe.materialKey)) / 1000;
    const { lambda, iterations } = colebrookLambda(Re, k_m / d_m);
    const headlossPerMeter = lambda * (rho * v * v) / (2 * d_m); // Pa/m
    const localFactor = 1 + settings.localLossesFraction;
    const totalDp = headlossPerMeter * pipe.length_m * localFactor;

    results.push({
      pipeId: pipe.id,
      G_kg_s: G,
      v_m_s: v,
      Re,
      lambda,
      headlossPerMeter_pa: headlossPerMeter,
      totalPressureDrop_pa: totalDp,
      iterations,
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

export function runFullCalc(
  nodes: SchemeNode[],
  pipes: SchemePipe[],
  settings: ProjectSettings,
): CalculationResults {
  const pipeResults = computePipeFlows(nodes, pipes, settings);
  const nodeResults = computeNodePressures(nodes, pipes, pipeResults, settings.sourcePressure_mpa);

  const totalLoad = nodes.reduce((s, n) => s + (n.heatLoad_w ?? 0), 0);
  const maxR = pipeResults.reduce((m, p) => Math.max(m, p.headlossPerMeter_pa), 0);
  const maxV = pipeResults.reduce((m, p) => Math.max(m, p.v_m_s), 0);

  const consumerPressures = nodeResults
    .filter((n) => nodes.find((x) => x.id === n.nodeId)?.kind === "consumer")
    .map((n) => n.pressureAtNode_mpa);
  const minConsumerP = consumerPressures.length ? Math.min(...consumerPressures) : 0;

  const pump = sizePump(nodes, pipes, pipeResults, settings);

  return {
    pipes: pipeResults,
    nodes: nodeResults,
    totalLoad_w: totalLoad,
    maxHeadlossPerMeter_pa: maxR,
    maxVelocity_m_s: maxV,
    minConsumerPressure_mpa: minConsumerP,
    pump,
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
  function dfsSupply(id: string, accum: number, visited: Set<string>) {
    if (visited.has(id)) return;
    visited.add(id);
    const node = nodes.find((n) => n.id === id);
    if (node?.kind === "consumer") supplyDpByConsumer.set(id, accum);
    for (const p of supplyAdj.get(id) ?? []) {
      const r = resultByPipe.get(p.id);
      if (!r) continue;
      dfsSupply(p.toNodeId, accum + r.totalPressureDrop_pa, new Set(visited));
    }
  }
  dfsSupply(sourceId, 0, new Set());

  // 2. Return leg: cumulative friction from each consumer back to source.
  // If no return pipes were supplied (synthetic supply-only network),
  // fall back to the balanced-2-pipe assumption (return ΔP ≈ supply ΔP).
  const returnDpByConsumer = new Map<string, number>();
  if (returnPipes.length > 0) {
    for (const [consumerId] of supplyDpByConsumer) {
      let total = 0;
      function walk(id: string, accum: number, visited: Set<string>) {
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
      }
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
