/**
 * Phase 6.6.1 — Dimension line helpers (pure functions).
 *
 * Math + label computation; rendering happens in SchemeEditor. Store
 * mutations happen via thin appliers from outside (applier pattern
 * from Phase 6.5 — no new StoreActions added).
 *
 * Pieces:
 *   - resolveDimensionEndpoints(): given a SchemeDimension + the
 *     current nodes[], returns the live anchor positions OR the
 *     cached XY fallback. Also reports whether the dimension is in
 *     "orphan state" (one or both anchors missing).
 *   - computeDimensionLabel(): auto-Haversine length when both
 *     anchors have geo, else Euclidean pixel-to-metre. Honours the
 *     `label` override.
 *   - dimensionGeometry(): given the two endpoint positions + offset,
 *     produces witness-line / dim-line / arrowhead / label coords for
 *     rendering.
 *   - dimensionBoundingBox(): for rubber-band hit testing.
 */

import type { SchemeDimension, SchemeNode } from "../hydraulicTypes";
import { haversineMeters } from "../calc/haversine";
import { pxToM } from "../nodeCatalog";

/** Resolved dimension endpoints. When `orphan` is true, the engineer
 *  needs to fix one or both anchors — renderer shows red dashed. */
export interface ResolvedDimension {
  from: { x: number; y: number };
  to: { x: number; y: number };
  /** True when at least one anchor node no longer exists in nodes[]. */
  orphan: boolean;
  /** Live node objects when found — used for Haversine label. */
  fromNode?: SchemeNode;
  toNode?: SchemeNode;
}

/**
 * Resolve a dimension's endpoint positions from the current node
 * graph. Prefers live anchor positions; falls back to cached XY when
 * either anchor is missing (orphan state).
 */
export function resolveDimensionEndpoints(
  dim: SchemeDimension,
  nodes: SchemeNode[],
): ResolvedDimension {
  const fromNode = nodes.find((n) => n.id === dim.fromNodeId);
  const toNode = nodes.find((n) => n.id === dim.toNodeId);
  const orphan = !fromNode || !toNode;

  const from = fromNode
    ? { x: fromNode.x, y: fromNode.y }
    : dim.fromNode_cached_xy ?? { x: 0, y: 0 };
  const to = toNode
    ? { x: toNode.x, y: toNode.y }
    : dim.toNode_cached_xy ?? { x: 0, y: 0 };

  return { from, to, orphan, fromNode, toNode };
}

/**
 * Compute the dimension's display label.
 *   - If `dim.label` is set → use it verbatim.
 *   - Else if both anchor nodes carry geo → Haversine length in m.
 *   - Else fall back to pixel-to-metre Euclidean (via PX_PER_METER).
 */
export function computeDimensionLabel(
  dim: SchemeDimension,
  resolved: ResolvedDimension,
): string {
  if (dim.label && dim.label.trim().length > 0) return dim.label;

  // Haversine path — both live nodes have geo.
  if (resolved.fromNode?.geo && resolved.toNode?.geo) {
    const m = haversineMeters(resolved.fromNode.geo, resolved.toNode.geo);
    return `${m.toFixed(2)}м`;
  }

  // Euclidean fallback.
  const dx = resolved.to.x - resolved.from.x;
  const dy = resolved.to.y - resolved.from.y;
  const dist_px = Math.sqrt(dx * dx + dy * dy);
  return `${pxToM(dist_px).toFixed(2)}м`;
}

/**
 * Geometry for rendering a dimension annotation. All coords are in
 * SVG pixel space.
 *
 * Output:
 *   - witness1 / witness2: the two perpendicular "tick" lines
 *     reaching from each anchor out to the offset distance
 *   - dimLine: the parallel-to-axis main line connecting the
 *     offset endpoints
 *   - arrow1 / arrow2: two short arrowhead lines pointing inward
 *   - labelPos: where to place the centred text label
 *   - angle_deg: dimension axis direction (for label rotation)
 */
export interface DimensionGeometry {
  witness1: { from: { x: number; y: number }; to: { x: number; y: number } };
  witness2: { from: { x: number; y: number }; to: { x: number; y: number } };
  dimLine: { from: { x: number; y: number }; to: { x: number; y: number } };
  arrow1Points: string; // SVG polygon points
  arrow2Points: string;
  labelPos: { x: number; y: number };
  angle_deg: number;
}

const ARROWHEAD_LENGTH = 8;
const ARROWHEAD_WIDTH = 3;
const WITNESS_GAP = 2;

export function dimensionGeometry(
  from: { x: number; y: number },
  to: { x: number; y: number },
  offset_px: number,
): DimensionGeometry {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1e-6) {
    // Degenerate (from == to). Return zero-geometry — caller may
    // skip rendering.
    return {
      witness1: { from, to: from },
      witness2: { from: to, to: to },
      dimLine: { from, to },
      arrow1Points: "",
      arrow2Points: "",
      labelPos: from,
      angle_deg: 0,
    };
  }
  // Unit perpendicular vector (rotate axis 90°).
  const perp = { x: -dy / len, y: dx / len };
  // Dimension-line endpoints (anchor + offset along perp).
  const dimFrom = { x: from.x + perp.x * offset_px, y: from.y + perp.y * offset_px };
  const dimTo = { x: to.x + perp.x * offset_px, y: to.y + perp.y * offset_px };
  // Witness lines: from a small gap above each anchor, out to the
  // dim-line endpoint plus a small overhang.
  const witnessGap = perp.x * WITNESS_GAP || perp.y * WITNESS_GAP ? WITNESS_GAP : 0;
  const witness1 = {
    from: { x: from.x + perp.x * witnessGap, y: from.y + perp.y * witnessGap },
    to: { x: from.x + perp.x * (offset_px + 4), y: from.y + perp.y * (offset_px + 4) },
  };
  const witness2 = {
    from: { x: to.x + perp.x * witnessGap, y: to.y + perp.y * witnessGap },
    to: { x: to.x + perp.x * (offset_px + 4), y: to.y + perp.y * (offset_px + 4) },
  };
  // Arrowheads at each dim-line endpoint, pointing INWARD.
  const unit = { x: dx / len, y: dy / len };
  const arrow1Tip = dimFrom;
  const arrow1Tail = {
    x: arrow1Tip.x + unit.x * ARROWHEAD_LENGTH,
    y: arrow1Tip.y + unit.y * ARROWHEAD_LENGTH,
  };
  const arrow1Side1 = {
    x: arrow1Tail.x + perp.x * ARROWHEAD_WIDTH,
    y: arrow1Tail.y + perp.y * ARROWHEAD_WIDTH,
  };
  const arrow1Side2 = {
    x: arrow1Tail.x - perp.x * ARROWHEAD_WIDTH,
    y: arrow1Tail.y - perp.y * ARROWHEAD_WIDTH,
  };
  const arrow1Points = `${arrow1Tip.x},${arrow1Tip.y} ${arrow1Side1.x},${arrow1Side1.y} ${arrow1Side2.x},${arrow1Side2.y}`;
  const arrow2Tip = dimTo;
  const arrow2Tail = {
    x: arrow2Tip.x - unit.x * ARROWHEAD_LENGTH,
    y: arrow2Tip.y - unit.y * ARROWHEAD_LENGTH,
  };
  const arrow2Side1 = {
    x: arrow2Tail.x + perp.x * ARROWHEAD_WIDTH,
    y: arrow2Tail.y + perp.y * ARROWHEAD_WIDTH,
  };
  const arrow2Side2 = {
    x: arrow2Tail.x - perp.x * ARROWHEAD_WIDTH,
    y: arrow2Tail.y - perp.y * ARROWHEAD_WIDTH,
  };
  const arrow2Points = `${arrow2Tip.x},${arrow2Tip.y} ${arrow2Side1.x},${arrow2Side1.y} ${arrow2Side2.x},${arrow2Side2.y}`;
  const labelPos = {
    x: (dimFrom.x + dimTo.x) / 2,
    y: (dimFrom.y + dimTo.y) / 2,
  };
  const angle_deg = (Math.atan2(dy, dx) * 180) / Math.PI;
  return {
    witness1,
    witness2,
    dimLine: { from: dimFrom, to: dimTo },
    arrow1Points,
    arrow2Points,
    labelPos,
    angle_deg,
  };
}

/**
 * Bounding box of the rendered dimension (witness + arrow + label
 * area). Used by rubber-band hit testing.
 */
export function dimensionBoundingBox(
  geom: DimensionGeometry,
): { minX: number; minY: number; maxX: number; maxY: number } {
  const xs = [
    geom.witness1.from.x, geom.witness1.to.x,
    geom.witness2.from.x, geom.witness2.to.x,
    geom.dimLine.from.x, geom.dimLine.to.x,
  ];
  const ys = [
    geom.witness1.from.y, geom.witness1.to.y,
    geom.witness2.from.y, geom.witness2.to.y,
    geom.dimLine.from.y, geom.dimLine.to.y,
  ];
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  };
}
