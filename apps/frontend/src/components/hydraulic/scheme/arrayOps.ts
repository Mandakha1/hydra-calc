/**
 * Phase 6.5.4 — Array operations (linear N×M + polar N-around-center).
 *
 * Builds on the foundation already shipped:
 *   - applyPaste() from clipboard.ts  → handles ID-rewriting + topology
 *   - rotateNodes() from transforms.ts → handles per-copy orientation
 *   - centroidPx() from transforms.ts → finds the cluster centre
 *
 * Engineering use cases (informing default parameters):
 *
 *   LINEAR — "10 ижил барилгуудтай хорооллын мөр, 30 м spacing":
 *     count_rows=1, count_cols=10, row=0, col=30, direction="Right-Down"
 *
 *   LINEAR — "5×2 grid layout, 4 row + 5 col of АОС":
 *     count_rows=5, count_cols=4, row=20, col=20, direction="Right-Down"
 *
 *   POLAR — "8 хэрэглэгчид circular зохиолтоор төвийн worker орчмууд":
 *     count=8, sweepAngleDeg=360 (full circle), rotateEachWithArray=true
 *
 *   POLAR — "12 satellite станц 360° evenly distributed":
 *     count=12, sweepAngleDeg=360, rotateEachWithArray=false
 *
 *   POLAR — "4 копи 90° arc-аар (солонгын spread)":
 *     count=4, startAngleDeg=0, sweepAngleDeg=90 (NOT 360),
 *     rotateEachWithArray=false
 *
 * Both functions are pure — they return arrays of cloned payloads; the
 * caller (or the future store action) inserts them via the existing
 * addNode/addPipe path. ID generation is delegated to the same `uid`
 * generator clipboard uses, so all generated IDs share the namespace.
 *
 * Topology preservation:
 *   Each cloned copy gets its own oldID→newID map (via applyPaste), so
 *   pipes within a copy stay connected; pipes BETWEEN copies are never
 *   created (which matches engineering expectation — array creates
 *   independent identical clusters, not a connected mesh).
 *
 * NOT in scope here:
 *   - Live ghost preview UI (deferred)
 *   - "Edit array as group" / "ungroup array" data model (out of scope
 *     for this phase — copies are fully independent after creation)
 *   - Undo coverage (deferred to 6.5.5)
 */
import type { SchemeNode, SchemePipe } from "../hydraulicTypes";
import { applyPaste, type ClipboardPayload } from "./clipboard";
import { rotateNodes, centroidPx } from "./transforms";

/* ─── Linear array ──────────────────────────────────────────────── */

/**
 * Cardinal direction the grid grows in. Letters describe (x, y) sign:
 *   Right-Down  → +x, +y  (default — same as paste's south-east offset)
 *   Right-Up    → +x, -y
 *   Left-Down   → -x, +y
 *   Left-Up     → -x, -y
 */
export type LinearArrayDirection = "Right-Down" | "Right-Up" | "Left-Down" | "Left-Up";

export interface LinearArrayParams {
  /** Number of rows. The first row (i=0) sits at the original's y. */
  rows: number;
  /** Number of columns. The first col (j=0) sits at the original's x. */
  cols: number;
  /** Vertical spacing between rows, in METRES. */
  rowSpacing_m: number;
  /** Horizontal spacing between columns, in METRES. */
  colSpacing_m: number;
  /** Grid growth direction. */
  direction: LinearArrayDirection;
}

/**
 * Build a linear N×M array of cloned payloads. The original (i=j=0)
 * is NOT included in the returned array — caller treats it as
 * unchanged and inserts only the new copies.
 *
 * Total returned copies = (rows × cols - 1).
 *
 * @returns Array of cloned payloads; each entry's `oldToNewId` lets
 *   the caller wire up array-group metadata if desired.
 */
export function linearArray(
  payload: ClipboardPayload,
  params: LinearArrayParams,
  uid: (prefix?: string) => string,
  mapPxPerMeter: number | null = null,
): Array<{ nodes: SchemeNode[]; pipes: SchemePipe[]; oldToNewId: Map<string, string> }> {
  if (params.rows < 1 || params.cols < 1) return [];
  const xSign = params.direction.startsWith("Right") ? 1 : -1;
  const ySign = params.direction.endsWith("Down") ? 1 : -1;
  const out: Array<{ nodes: SchemeNode[]; pipes: SchemePipe[]; oldToNewId: Map<string, string> }> = [];
  for (let i = 0; i < params.rows; i += 1) {
    for (let j = 0; j < params.cols; j += 1) {
      if (i === 0 && j === 0) continue; // skip original
      const offset_m = {
        x: j * params.colSpacing_m * xSign,
        y: i * params.rowSpacing_m * ySign,
      };
      out.push(applyPaste(payload, uid, offset_m, mapPxPerMeter));
    }
  }
  return out;
}

/* ─── Polar array ───────────────────────────────────────────────── */

export interface PolarArrayParams {
  /** Centre point in pixel space — engineer clicks the canvas to set
   *  this. The array's copies orbit around it. */
  center_px: { x: number; y: number };
  /** Total number of copies including the original at position 0.
   *  Example: count=8 + full-circle sweep → 1 original + 7 copies. */
  count: number;
  /** Starting angle in degrees (CCW from +x axis, math convention).
   *  When omitted, the original cluster's existing angle relative to
   *  the centre is used (no rotation on the first copy). */
  startAngleDeg?: number;
  /** Total angular span across all copies, in degrees.
   *   - 360 = closed circle (each copy 360/count° apart)
   *   - 90  = quarter arc spread, copies evenly spaced
   *   - 180 = half-circle spread
   *  The increment per copy is sweepAngleDeg / count for closed
   *  circles, or sweepAngleDeg / (count - 1) for open arcs. We use
   *  the closed-circle formula always — for arcs the engineer can
   *  pick sweepAngleDeg slightly less than the desired span. */
  sweepAngleDeg: number;
  /** When true, each copy is also rotated by its position angle
   *  about its OWN centroid, so the cluster orientation tracks the
   *  arc. Useful for repeated symmetric layouts where each copy
   *  should face the centre. Default false. */
  rotateEachWithArray?: boolean;
}

/**
 * Build a polar array of cloned payloads orbiting `center_px`.
 *
 * The original cluster's current centroid defines the orbit radius
 * (distance to centre). Each subsequent copy sits at the same radius
 * but rotated by `k · (sweepAngleDeg / count)` degrees about the
 * centre.
 *
 * The original (k=0) is NOT in the returned array. Total returned
 * copies = (count - 1).
 *
 * @returns Array of cloned payloads in radial order.
 */
export function polarArray(
  payload: ClipboardPayload,
  params: PolarArrayParams,
  uid: (prefix?: string) => string,
  mapPxPerMeter: number | null = null,
): Array<{ nodes: SchemeNode[]; pipes: SchemePipe[]; oldToNewId: Map<string, string> }> {
  if (params.count < 2) return [];

  // Original cluster centroid + its angle/radius relative to centre.
  const origCentroid = centroidPx(payload.nodes);
  const dx_orig = origCentroid.x - params.center_px.x;
  const dy_orig = origCentroid.y - params.center_px.y;
  const radius = Math.sqrt(dx_orig * dx_orig + dy_orig * dy_orig);
  // Existing angle (atan2 result in radians → degrees).
  const existing_deg = (Math.atan2(dy_orig, dx_orig) * 180) / Math.PI;
  // The first copy starts at startAngleDeg if provided, else at the
  // original's existing angle (no rotation = original position).
  const start_deg = params.startAngleDeg ?? existing_deg;
  // Step per copy. Closed circle (sweep=360, count=N) gives N copies
  // 360/N° apart with the last one just before the first.
  const step_deg = params.sweepAngleDeg / params.count;

  const out: Array<{ nodes: SchemeNode[]; pipes: SchemePipe[]; oldToNewId: Map<string, string> }> = [];
  // Caller treats original (k=0) as unchanged; copies are k=1..count-1.
  for (let k = 1; k < params.count; k += 1) {
    const angle_deg = start_deg + k * step_deg;
    const angle_rad = (angle_deg * Math.PI) / 180;
    // New centroid for this copy: same radius, new angle.
    const newCentroid = {
      x: params.center_px.x + radius * Math.cos(angle_rad),
      y: params.center_px.y + radius * Math.sin(angle_rad),
    };
    const offset_px = {
      x: newCentroid.x - origCentroid.x,
      y: newCentroid.y - origCentroid.y,
    };
    // applyPaste expects offset_m + mapPxPerMeter for the pixel shift.
    // For polar array we already have a pixel-space offset, so we
    // convert it to "metres at mapPxPerMeter scale" so applyPaste
    // re-multiplies to give the right pixel value. When the project
    // isn't on a map, pass null + raw px so they're treated as
    // metres-with-1:1 mapping (offset_m == offset_px).
    const offset_m = mapPxPerMeter
      ? { x: offset_px.x / mapPxPerMeter, y: offset_px.y / mapPxPerMeter }
      : offset_px;
    const cloned = applyPaste(payload, uid, offset_m, mapPxPerMeter);

    // Optional: rotate the cloned cluster about its new centroid so
    // its orientation tracks the orbit angle (k · step_deg).
    if (params.rotateEachWithArray) {
      const rotAngle = k * step_deg;
      const newCentroidOfClone = centroidPx(cloned.nodes);
      cloned.nodes = rotateNodes(cloned.nodes, newCentroidOfClone, rotAngle);
    }
    out.push(cloned);
  }
  return out;
}
