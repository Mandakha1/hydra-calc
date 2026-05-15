/**
 * Phase 12.8 — Pipe flow direction arrows.
 *
 * Pure helpers that compute one chevron arrowhead per pipe indicating
 * the flow direction at the pipe midpoint. Two source-of-truth modes:
 *
 *   "geometric": from → to. No calc results required. Useful at the
 *      drawing stage before any solve has run.
 *
 *   "computed": uses the solver's result_g_kg_s sign — positive flow
 *      keeps the geometric direction, negative flow reverses the
 *      arrow. Engineer relies on this once the network is solved.
 *
 * The renderer (SchemeEditor) consumes the arrow's tip + tail SVG
 * point coordinates and draws a small two-line chevron.
 */
import type { CalculationResults, SchemeNode, SchemePipe } from "../hydraulicTypes";

export type FlowDirectionMode = "geometric" | "computed";

export interface PipeArrow {
  pipeId: string;
  /** Tip x in scheme-space pixels. */
  tipX: number;
  /** Tip y. */
  tipY: number;
  /** Tail point 1 (chevron wing). */
  tail1X: number;
  tail1Y: number;
  /** Tail point 2 (other chevron wing). */
  tail2X: number;
  tail2Y: number;
  /** True when flow direction was flipped by computed results. */
  reversed: boolean;
}

/** Default chevron length in pixels. Renderer can override. */
export const ARROW_LENGTH_PX = 12;
/** Half-angle of the chevron wings (radians). 22.5° spread. */
const ARROW_HALF_ANGLE_RAD = Math.PI / 8;

/**
 * Resolve the segment a pipe's midpoint sits on. Considers bend
 * points + waypoints + legacy ortho90 elbow. Returns the (a, b)
 * endpoints of the central segment so the arrow direction matches
 * the visible polyline at midpoint.
 */
function midSegment(
  pipe: SchemePipe,
  fromNode: SchemeNode,
  toNode: SchemeNode,
): {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  midX: number;
  midY: number;
} {
  const points: { x: number; y: number }[] = [
    { x: fromNode.x, y: fromNode.y },
  ];
  if (pipe.bendPoints?.length) {
    for (const bp of pipe.bendPoints) points.push({ x: bp.x, y: bp.y });
  } else if (pipe.waypoints?.length) {
    for (const w of pipe.waypoints) points.push({ x: w.x, y: w.y });
  }
  points.push({ x: toNode.x, y: toNode.y });

  const midIdx = Math.max(1, Math.floor(points.length / 2));
  const a = points[midIdx - 1]!;
  const b = points[midIdx]!;
  return {
    ax: a.x,
    ay: a.y,
    bx: b.x,
    by: b.y,
    midX: (a.x + b.x) / 2,
    midY: (a.y + b.y) / 2,
  };
}

/**
 * Build a single arrow for a pipe. Returns null when an endpoint
 * node is missing or the pipe is degenerate (zero-length segment).
 */
export function buildPipeArrow(
  pipe: SchemePipe,
  nodes: ReadonlyArray<SchemeNode>,
  mode: FlowDirectionMode,
  results: CalculationResults | undefined,
): PipeArrow | null {
  const fromNode = nodes.find((n) => n.id === pipe.fromNodeId);
  const toNode = nodes.find((n) => n.id === pipe.toNodeId);
  if (!fromNode || !toNode) return null;

  const seg = midSegment(pipe, fromNode, toNode);
  const dx = seg.bx - seg.ax;
  const dy = seg.by - seg.ay;
  const len = Math.hypot(dx, dy);
  if (len < 0.001) return null;

  // Determine reversal from solver results when in computed mode.
  let reversed = false;
  if (mode === "computed" && results) {
    const r = results.pipes.find((rp) => rp.pipeId === pipe.id);
    if (r && typeof r.G_kg_s === "number" && r.G_kg_s < 0) {
      reversed = true;
    }
  }

  // Direction unit vector (forward = from → to in scheme-space).
  const ux = dx / len;
  const uy = dy / len;
  const dirX = reversed ? -ux : ux;
  const dirY = reversed ? -uy : uy;

  // Tip = midpoint + half-length forward.
  const tipX = seg.midX + dirX * (ARROW_LENGTH_PX / 2);
  const tipY = seg.midY + dirY * (ARROW_LENGTH_PX / 2);
  // Tails = midpoint - half-length forward + rotated wings.
  const baseX = seg.midX - dirX * (ARROW_LENGTH_PX / 2);
  const baseY = seg.midY - dirY * (ARROW_LENGTH_PX / 2);
  // Wing length is the same as half the chevron length.
  const wingLen = ARROW_LENGTH_PX / 2;
  const cos = Math.cos(ARROW_HALF_ANGLE_RAD);
  const sin = Math.sin(ARROW_HALF_ANGLE_RAD);

  // Rotate dir vector by +/- half-angle for the two wings.
  const tail1X = baseX + (-dirX * cos - dirY * sin) * wingLen;
  const tail1Y = baseY + (-dirY * cos + dirX * sin) * wingLen;
  const tail2X = baseX + (-dirX * cos + dirY * sin) * wingLen;
  const tail2Y = baseY + (-dirY * cos - dirX * sin) * wingLen;

  return {
    pipeId: pipe.id,
    tipX,
    tipY,
    tail1X,
    tail1Y,
    tail2X,
    tail2Y,
    reversed,
  };
}

/** Build arrows for an entire pipe collection. Skips pipes that
 *  belong to a composite channel (`channelId` set) — channel polyline
 *  carries its own direction via its midpoint badge. */
export function buildAllArrows(
  pipes: ReadonlyArray<SchemePipe>,
  nodes: ReadonlyArray<SchemeNode>,
  mode: FlowDirectionMode,
  results: CalculationResults | undefined,
): PipeArrow[] {
  const out: PipeArrow[] = [];
  for (const p of pipes) {
    if (p.channelId) continue;
    const a = buildPipeArrow(p, nodes, mode, results);
    if (a) out.push(a);
  }
  return out;
}
