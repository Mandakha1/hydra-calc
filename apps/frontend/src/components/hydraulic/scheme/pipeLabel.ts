/**
 * Phase 13.21 — Engineer-facing pipe label panel + Q (kW) inference.
 *
 * Engineer report: "Шугам хоолойн диаметр, нэршил, урсгалын хурд,
 * даралт, дулааны ачаалал зэргийг сум зааж зураг дээр ойлгомжтой
 * цэгцтэй харагддаг болгоно уу."
 *
 * Renders a compact multi-line callout near each pipe midpoint:
 *
 *   [1-2] Т1
 *   DN100  L=35.6м
 *   Q=2016 кВт · v=0.77 м/с
 *   ΔP=200 Pa
 *
 * Pure helpers — no DOM. The SVG render path lives in SchemeEditor.
 */

import type {
  CalculationResults,
  SchemeNode,
  SchemePipe,
} from "../hydraulicTypes";
import type { PipeCircuit } from "../nodeCatalog";

/** Specific heat capacity of water (kJ / kg / K). Used for Q = G · c · ΔT. */
export const WATER_CP_KJ_KG_K = 4.186;

/** Engineer-typical ΔT per circuit kind (°C). When the project's
 *  temperature schedule is unavailable / not applicable to the circuit
 *  (e.g. cold water), these defaults keep the label populated rather
 *  than blank. */
const DEFAULT_DT_BY_CIRCUIT: Record<PipeCircuit, number> = {
  heating_supply: 20,
  heating_return: 20,
  dhw_supply: 50,
  dhw_recirc: 50,
  cold_water: 0, // no thermal capacity for sizing — Q ignored on cold
};

/**
 * Infer the thermal Q (kW) carried by a pipe.
 *
 * Priority:
 *   1. Solver-provided G (kg/s) × c_p × ΔT — best when results exist
 *      (matches the heat-load delivered to all downstream consumers).
 *   2. Geometric fallback: from-node's stored `heatLoad_w` (the
 *      writeback path populates this for branch + consumer nodes
 *      post-solve, and engineer-set values stand in pre-solve).
 *   3. 0 — pipe is cold-water OR no info available; the label panel
 *      hides the Q row when this returns 0.
 */
export function inferPipeQ_kW(
  pipe: SchemePipe,
  fromNode: SchemeNode | undefined,
  results: CalculationResults | undefined,
  scheduleDeltaT_c: number = 60,
): number {
  if (pipe.circuit === "cold_water") return 0;
  const dt = scheduleDeltaT_c > 0
    ? scheduleDeltaT_c
    : DEFAULT_DT_BY_CIRCUIT[pipe.circuit ?? "heating_supply"];
  const r = results?.pipes.find((x) => x.pipeId === pipe.id);
  if (r && r.G_kg_s > 0 && dt > 0) {
    return r.G_kg_s * WATER_CP_KJ_KG_K * dt;
  }
  if (fromNode?.heatLoad_w && fromNode.heatLoad_w > 0) {
    return fromNode.heatLoad_w / 1000;
  }
  return 0;
}

/**
 * Build the 1-4 line label content for a pipe in DISPLAY order.
 *
 * Returns the lines as an array so the renderer can position each
 * line at a known y-offset and skip blank ones. Each line is a tuple
 * of `[text, accent?]` — the accent flag tells the renderer to draw
 * that specific line in the pipe-circuit colour (used for the
 * section number / circuit tag line).
 */
export function buildPipeLabelLines(args: {
  pipe: SchemePipe;
  fromIndex: number; // 1-based node index for engineer-facing label
  toIndex: number;
  fromNode: SchemeNode | undefined;
  results: CalculationResults | undefined;
  scheduleDeltaT_c: number;
}): Array<{ text: string; accent: boolean }> {
  const { pipe, fromIndex, toIndex, fromNode, results, scheduleDeltaT_c } = args;
  const r = results?.pipes.find((x) => x.pipeId === pipe.id);
  const Q_kW = inferPipeQ_kW(pipe, fromNode, results, scheduleDeltaT_c);
  const lines: Array<{ text: string; accent: boolean }> = [];
  // Line 1 — section number + circuit tag (e.g. "1-2 · Т1")
  lines.push({
    text: `${fromIndex}-${toIndex} · ${shortCircuit(pipe.circuit)}`,
    accent: true,
  });
  // Line 2 — DN + length
  lines.push({
    text: `DN${pipe.dn} · L=${formatLengthMeters(pipe.length_m)}`,
    accent: false,
  });
  // Line 3 — Q kW (skipped when 0, e.g. cold water without computed flow)
  if (Q_kW > 0) {
    lines.push({
      text: `Q=${formatPower(Q_kW)} кВт${
        r ? ` · v=${r.v_m_s.toFixed(2)} м/с` : ""
      }`,
      accent: false,
    });
  } else if (r) {
    lines.push({ text: `v=${r.v_m_s.toFixed(2)} м/с`, accent: false });
  }
  // Line 4 — pressure drop (only when solved)
  if (r) {
    lines.push({
      text: `ΔP=${formatPressure(r.totalPressureDrop_pa)} · R=${r.headlossPerMeter_pa.toFixed(0)} Pa/м`,
      accent: false,
    });
  }
  return lines;
}

function shortCircuit(c: PipeCircuit | undefined): string {
  switch (c) {
    case "heating_supply":
      return "Т1";
    case "heating_return":
      return "Т2";
    case "dhw_supply":
      return "Т3";
    case "dhw_recirc":
      return "Т4";
    case "cold_water":
      return "В1";
    default:
      return "—";
  }
}

function formatLengthMeters(m: number | undefined): string {
  if (!m || m <= 0) return "0м";
  if (m < 10) return `${m.toFixed(1)}м`;
  return `${Math.round(m)}м`;
}

function formatPower(kw: number): string {
  if (kw >= 1000) return `${(kw / 1000).toFixed(2)} МВт`;
  if (kw >= 100) return `${kw.toFixed(0)}`;
  return `${kw.toFixed(1)}`;
}

function formatPressure(pa: number): string {
  if (Math.abs(pa) >= 1000) return `${(pa / 1000).toFixed(1)} кПа`;
  return `${Math.round(pa)} Pa`;
}
