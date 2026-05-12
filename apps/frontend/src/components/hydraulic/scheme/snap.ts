/**
 * Phase 6B — snap engine.
 *
 * Three independent snap modes engineers can toggle on/off:
 *
 *   1. Grid snap (G key): when placing or moving a node, round its
 *      coordinates to the nearest grid cell (1 m / 5 m / 10 m).
 *      Catches the "off-by-3 px misalignment" class of bug.
 *
 *   2. Angle snap (A key): when drawing a pipe, constrain the second
 *      click's angle relative to the first node to a multiple of N°
 *      (15 / 30 / 45 / 90). Produces clean 90°, 45°, and 30°
 *      branches that match engineering drawing conventions.
 *
 *   3. Endpoint snap (E key): when placing a new node, check distance
 *      to all existing nodes — if within `pixelThreshold` of an
 *      existing one, snap to it (re-use the existing node ID rather
 *      than creating a duplicate). Catches the "two nodes at almost-
 *      same coords but the pipe didn't connect" bug class.
 *
 * The module is pure — it operates on pixel/meter coordinates and
 * returns the snapped result. SchemeEditor wires it into the
 * existing onCanvasClick / onCanvasMouseMove / placeNodeAt paths.
 */

/* ─── Types ─────────────────────────────────────────────────────── */

export type GridSize = 1 | 5 | 10;
export type AngleIncrement = 15 | 30 | 45 | 90;

export interface SnapSettings {
  grid: { enabled: boolean; sizeM: GridSize };
  angle: { enabled: boolean; incrementDeg: AngleIncrement };
  endpoint: { enabled: boolean; pixelThreshold: number };
}

/** Default settings — grid on @ 5 m (БНбД-typical magistral spacing),
 *  ortho 90° angle on, endpoint on with 12-px threshold. */
export const DEFAULT_SNAP: SnapSettings = {
  grid: { enabled: true, sizeM: 5 },
  angle: { enabled: true, incrementDeg: 90 },
  endpoint: { enabled: true, pixelThreshold: 12 },
};

/* ─── Grid snap ─────────────────────────────────────────────────── */

/**
 * Snap a single coordinate (in metres) to the nearest grid cell.
 *
 *   snapGridM(7,  5) → 5
 *   snapGridM(3,  5) → 5  (closer to 5 than 0)
 *   snapGridM(2,  5) → 0
 *   snapGridM(-3, 5) → -5
 *
 * Pass `enabled = false` and the value is returned unchanged — keeps
 * the call-site simple (always `snapGridM(x, size, enabled)` instead
 * of branching).
 */
export function snapGridM(value_m: number, sizeM: number, enabled = true): number {
  if (!enabled || sizeM <= 0) return value_m;
  return Math.round(value_m / sizeM) * sizeM;
}

/**
 * Snap an (x, y) pair to grid. Both coordinates in metres.
 *
 * @returns The snapped point. Calling code can compare to the input
 *   to detect whether snapping happened.
 */
export function snapPointToGridM(
  pt: { x: number; y: number },
  sizeM: number,
  enabled = true,
): { x: number; y: number } {
  return {
    x: snapGridM(pt.x, sizeM, enabled),
    y: snapGridM(pt.y, sizeM, enabled),
  };
}

/* ─── Angle snap ────────────────────────────────────────────────── */

/**
 * Project a target point onto the nearest ray of the given angle
 * increment, anchored at the source point. Pure 2D Euclidean math —
 * works in either pixel or metre space, just be consistent.
 *
 * Algorithm:
 *   1. Compute current angle θ from source to target.
 *   2. Round θ to nearest multiple of incrementDeg → θ_snap.
 *   3. Compute distance ρ from source to target.
 *   4. Project: snapped = source + (ρ·cos(θ_snap), ρ·sin(θ_snap)).
 *
 * The projected distance equals the input distance, so the user's
 * cursor stays close to where they pointed — only the direction
 * snaps. This is the same UX as AutoCAD's polar tracking + ZULU's
 * line-tool angle constraint.
 */
export function snapAngle(
  source: { x: number; y: number },
  target: { x: number; y: number },
  incrementDeg: number,
  enabled = true,
): { x: number; y: number; snappedAngleDeg: number } {
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const rho = Math.sqrt(dx * dx + dy * dy);
  if (rho < 1e-9) {
    // Target = source. Return target unchanged; angle is undefined.
    return { x: target.x, y: target.y, snappedAngleDeg: 0 };
  }
  const theta_deg = (Math.atan2(dy, dx) * 180) / Math.PI;
  if (!enabled || incrementDeg <= 0) {
    return { x: target.x, y: target.y, snappedAngleDeg: theta_deg };
  }
  // Round to nearest multiple of incrementDeg. Handle negative
  // angles cleanly (atan2 returns -180..+180).
  const snapped_deg = Math.round(theta_deg / incrementDeg) * incrementDeg;
  const snapped_rad = (snapped_deg * Math.PI) / 180;
  return {
    x: source.x + rho * Math.cos(snapped_rad),
    y: source.y + rho * Math.sin(snapped_rad),
    snappedAngleDeg: snapped_deg,
  };
}

/* ─── Endpoint snap ─────────────────────────────────────────────── */

/**
 * Find the nearest existing node within `pixelThreshold` of the
 * target point. Returns the snapped target + the matched node ID
 * (or null when nothing in range).
 *
 * Used by:
 *   - "Place node" flows: if the user clicks near an existing node,
 *     re-use that node instead of creating a near-duplicate.
 *   - "Connect pipe" tool's second click: snap the pipe endpoint to
 *     the exact pixel of the target node so the line meets cleanly.
 *
 * @param target          Click point in pixel space.
 * @param nodes           Existing nodes with their displayed pixel
 *                        positions. (Caller passes the same
 *                        `displayPos(n)` they use for rendering, so
 *                        the snap works under pan/zoom.)
 * @param pixelThreshold  Snap radius in screen pixels.
 * @returns               { snapped: {x,y}, nodeId: string | null }.
 *                        When no node is in range, returns the
 *                        original target unchanged + null id.
 */
export function findEndpointSnap(
  target: { x: number; y: number },
  nodes: Array<{ id: string; x: number; y: number }>,
  pixelThreshold: number,
  enabled = true,
): { snapped: { x: number; y: number }; nodeId: string | null } {
  if (!enabled || pixelThreshold <= 0) {
    return { snapped: target, nodeId: null };
  }
  let bestDist = pixelThreshold;
  let bestNode: { id: string; x: number; y: number } | null = null;
  for (const n of nodes) {
    const dx = n.x - target.x;
    const dy = n.y - target.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < bestDist) {
      bestDist = d;
      bestNode = n;
    }
  }
  if (!bestNode) return { snapped: target, nodeId: null };
  return { snapped: { x: bestNode.x, y: bestNode.y }, nodeId: bestNode.id };
}

/* ─── Combined apply ────────────────────────────────────────────── */

/**
 * Apply grid snap AND endpoint snap in the right order for a "place
 * a new node here" operation.
 *
 *   1. Endpoint snap first: if the click is on top of an existing
 *      node, re-use it (most useful behavior).
 *   2. Otherwise grid snap: round to the grid.
 *
 * Engineers don't want the grid to override endpoint — clicking on
 * a chamber should always reuse the chamber, not jump to the grid
 * next to it.
 */
export function applyPlacementSnap(
  target: { x: number; y: number },
  nodes: Array<{ id: string; x: number; y: number }>,
  settings: SnapSettings,
  /** Convert pixel coords → metre coords. Used to apply the grid
   *  rule in real-world units, then convert back. Pass a no-op
   *  pair when you're already working in metre space. */
  pxToM: (px: number) => number = (px) => px,
  mToPx: (m: number) => number = (m) => m,
): { snapped: { x: number; y: number }; nodeId: string | null } {
  // 1. Endpoint snap wins.
  if (settings.endpoint.enabled) {
    const ep = findEndpointSnap(target, nodes, settings.endpoint.pixelThreshold, true);
    if (ep.nodeId !== null) return ep;
  }
  // 2. Grid snap (in metres, then back to pixels).
  if (settings.grid.enabled && settings.grid.sizeM > 0) {
    const m = { x: pxToM(target.x), y: pxToM(target.y) };
    const snapped_m = snapPointToGridM(m, settings.grid.sizeM, true);
    return {
      snapped: { x: mToPx(snapped_m.x), y: mToPx(snapped_m.y) },
      nodeId: null,
    };
  }
  // 3. No snap → identity.
  return { snapped: target, nodeId: null };
}
