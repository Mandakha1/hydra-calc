/**
 * N-1 Contingency / Failure Simulation.
 *
 * Engineering pattern from Zulu Thermo's "Надежность" module ($20K paid add-on).
 * For any selected pipe or node, simulate it being out-of-service and recompute
 * the network. Show which consumers lose pressure / temperature / are cut off.
 *
 * Output: per-consumer impact (Δp_lost in MPa, ΔT_lost in °C, fully cut-off flag).
 */
import type { HydraulicState, SchemeNode, SchemePipe, CalculationResults } from "../hydraulicTypes";
import { runFullCalc } from "./hydraulics";

export type FailureMode = "pipe" | "node";

export interface ConsumerImpact {
  consumerId: string;
  consumerLabel: string;
  baselinePressure_mpa: number;
  failurePressure_mpa: number;
  pressureDrop_mpa: number;
  cutOff: boolean;
  /** Required pressure for this consumer (MPa). */
  required_mpa: number;
  /** Was meeting requirement before failure? */
  metBefore: boolean;
  /** Still meeting requirement after failure? */
  metAfter: boolean;
}

export interface FailureSimulation {
  mode: FailureMode;
  /** ID of the failed element. */
  failedId: string;
  /** Human label of the failed element. */
  failedLabel: string;
  /** Per-consumer impact rows. */
  impacts: ConsumerImpact[];
  /** Aggregate stats. */
  summary: {
    totalConsumers: number;
    affectedConsumers: number;     // any pressure drop > 0.01 MPa
    cutOffConsumers: number;        // pressure now < required
    newlyFailingConsumers: number;  // metBefore && !metAfter
    totalLostLoad_w: number;
    maxPressureDrop_mpa: number;
  };
  /** Color for each consumer (red→yellow→green) keyed by consumer ID. */
  heatmap: Map<string, string>;
}

const HEATMAP = {
  ok: "#3a7044",          // forest green — no impact
  warn: "#b7861a",        // amber — slight drop (<10%)
  alert: "#d97706",       // orange — significant drop (10-30%)
  critical: "#b0392e",    // oxide red — severe (>30% or cut off)
};

function colorForImpact(drop_mpa: number, baseline_mpa: number, cutOff: boolean): string {
  if (cutOff) return HEATMAP.critical;
  if (baseline_mpa <= 0.001) return HEATMAP.ok;
  const pct = drop_mpa / baseline_mpa;
  if (pct < 0.02) return HEATMAP.ok;
  if (pct < 0.10) return HEATMAP.warn;
  if (pct < 0.30) return HEATMAP.alert;
  return HEATMAP.critical;
}

/**
 * Run baseline computation (already done usually) + failure scenario.
 * Returns full impact analysis.
 */
export function simulateFailure(
  state: HydraulicState,
  failedElementId: string,
  mode: FailureMode,
  baseline?: CalculationResults,
): FailureSimulation {
  // 1. Baseline (compute if not provided)
  const baselineResults = baseline ?? runFullCalc(state.nodes, state.pipes, state.settings);

  // 2. Build "failed" copy of network
  let failedNodes = state.nodes;
  let failedPipes = state.pipes;
  let failedLabel = "?";

  if (mode === "pipe") {
    const failedPipe = state.pipes.find((p) => p.id === failedElementId);
    failedLabel = failedPipe ? `Хоолой ${failedPipe.fromNodeId.slice(0, 6)}→${failedPipe.toNodeId.slice(0, 6)} (DN${failedPipe.dn})` : "?";
    failedPipes = state.pipes.filter((p) => p.id !== failedElementId);
  } else {
    const failedNode = state.nodes.find((n) => n.id === failedElementId);
    failedLabel = failedNode?.label ?? "?";
    failedNodes = state.nodes.filter((n) => n.id !== failedElementId);
    failedPipes = state.pipes.filter((p) => p.fromNodeId !== failedElementId && p.toNodeId !== failedElementId);
  }

  // 3. Recompute with failure
  const failureResults = runFullCalc(failedNodes, failedPipes, state.settings);

  // 4. Per-consumer impact
  const impacts: ConsumerImpact[] = [];
  const heatmap = new Map<string, string>();
  let totalLostLoad = 0;
  let maxDrop = 0;

  for (const node of state.nodes) {
    if (!node.kind?.startsWith("consumer_") && node.kind !== "consumer") continue;
    const baseR = baselineResults.nodes.find((n) => n.nodeId === node.id);
    const failR = failureResults.nodes.find((n) => n.nodeId === node.id);

    const basePressure = baseR?.pressureAtNode_mpa ?? 0;
    const failPressure = failR?.pressureAtNode_mpa ?? 0;
    const drop = Math.max(0, basePressure - failPressure);
    const required = node.requiredPressure_mpa ?? 0.15;
    const metBefore = basePressure >= required;
    const metAfter = failPressure >= required;
    const cutOff = mode === "node" && failedElementId === node.id ? true : !metAfter;

    impacts.push({
      consumerId: node.id,
      consumerLabel: node.label,
      baselinePressure_mpa: basePressure,
      failurePressure_mpa: failPressure,
      pressureDrop_mpa: drop,
      cutOff,
      required_mpa: required,
      metBefore,
      metAfter,
    });

    if (cutOff) totalLostLoad += node.heatLoad_w ?? 0;
    if (drop > maxDrop) maxDrop = drop;

    heatmap.set(node.id, colorForImpact(drop, basePressure, cutOff));
  }

  const affected = impacts.filter((i) => i.pressureDrop_mpa > 0.01);
  const cutOffSet = impacts.filter((i) => i.cutOff);
  const newlyFailing = impacts.filter((i) => i.metBefore && !i.metAfter);

  return {
    mode,
    failedId: failedElementId,
    failedLabel,
    impacts,
    summary: {
      totalConsumers: impacts.length,
      affectedConsumers: affected.length,
      cutOffConsumers: cutOffSet.length,
      newlyFailingConsumers: newlyFailing.length,
      totalLostLoad_w: totalLostLoad,
      maxPressureDrop_mpa: maxDrop,
    },
    heatmap,
  };
}

/**
 * Sweep all pipes — find the most critical one (highest impact if it fails).
 * Heavy operation — runs N+1 calculations.
 */
export function findCriticalElements(
  state: HydraulicState,
  baseline?: CalculationResults,
): Array<{ pipeId: string; pipeLabel: string; impactScore: number; affectedCount: number; cutOffCount: number }> {
  const baselineResults = baseline ?? runFullCalc(state.nodes, state.pipes, state.settings);
  const out: Array<{ pipeId: string; pipeLabel: string; impactScore: number; affectedCount: number; cutOffCount: number }> = [];
  for (const pipe of state.pipes) {
    const sim = simulateFailure(state, pipe.id, "pipe", baselineResults);
    out.push({
      pipeId: pipe.id,
      pipeLabel: `Хоолой ${pipe.fromNodeId.slice(0, 8)}→${pipe.toNodeId.slice(0, 8)} (DN${pipe.dn})`,
      impactScore: sim.summary.totalLostLoad_w + sim.summary.maxPressureDrop_mpa * 1e6,
      affectedCount: sim.summary.affectedConsumers,
      cutOffCount: sim.summary.cutOffConsumers,
    });
  }
  out.sort((a, b) => b.impactScore - a.impactScore);
  return out;
}
