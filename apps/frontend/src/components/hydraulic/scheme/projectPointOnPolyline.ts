/**
 * Phase 13.24 — Project a point onto a polyline.
 *
 * Engineer report: "Салбар шугам зурахдаа яг Cursor аваачсан тэр
 * цэгээс шууд салбар шугам зурах, курсор аваачсан цэгт хаалт, худаг,
 * компенсатор хийх боломжтой болгоно уу."
 *
 * Returns the closest point on the polyline to a given click point,
 * plus the parametric `t ∈ [0, 1]` along the polyline's total length.
 * Used by the right-click "place at cursor" workflow:
 *
 *   1. Engineer right-clicks on a visible pipe
 *   2. The handler captures the click in scheme-space coords (via
 *      `toSvg`) and projects onto the pipe's DISPLAYED polyline
 *      (Phase 13.14 `displayVertex` + Phase 13.20 parallel offset).
 *   3. `t` is fed into `splitPipeAtFraction` so the inserted node
 *      (chamber / valve / compensator / tee) lands AT THE CURSOR
 *      rather than at the geometric midpoint.
 *
 * Pure math — no DOM. Tested directly.
 */

export interface XY {
  x: number;
  y: number;
}

/**
 * Project `click` onto each polyline segment and return the closest
 * match (smallest perpendicular distance). Returns:
 *
 *   - `t`: arc-length fraction along the polyline ∈ [0, 1]
 *   - `point`: the projected point coords (caller can render or use)
 *   - `distance`: perpendicular distance from click to the polyline
 *     (engineer's UI can use this to bail out if the click was too
 *     far from the pipe, e.g. > 20 px — implies they meant something
 *     else; defaults stay generous so it's not a hard gate.)
 *   - `segmentIndex`: which segment of the polyline the projection
 *     landed on (0-based), useful for downstream bend-split logic.
 *
 * Returns null when the polyline has fewer than 2 points.
 */
export function projectPointOnPolyline(
  click: XY,
  polyline: ReadonlyArray<XY>,
): {
  t: number;
  point: XY;
  distance: number;
  segmentIndex: number;
} | null {
  if (polyline.length < 2) return null;
  const segLens: number[] = [];
  let totalLen = 0;
  for (let i = 1; i < polyline.length; i += 1) {
    const a = polyline[i - 1]!;
    const b = polyline[i]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    segLens.push(len);
    totalLen += len;
  }
  // Degenerate (all-equal points) — return the only point + midpoint t
  if (totalLen < 1e-6) {
    return {
      t: 0.5,
      point: { x: polyline[0]!.x, y: polyline[0]!.y },
      distance: Math.hypot(click.x - polyline[0]!.x, click.y - polyline[0]!.y),
      segmentIndex: 0,
    };
  }
  let bestDist = Number.POSITIVE_INFINITY;
  let bestT = 0;
  let bestPoint: XY = { x: polyline[0]!.x, y: polyline[0]!.y };
  let bestSegIdx = 0;
  let accLen = 0;
  for (let i = 0; i < segLens.length; i += 1) {
    const a = polyline[i]!;
    const b = polyline[i + 1]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    if (len2 < 1e-9) {
      accLen += segLens[i]!;
      continue;
    }
    let u = ((click.x - a.x) * dx + (click.y - a.y) * dy) / len2;
    u = Math.max(0, Math.min(1, u)); // clamp to segment
    const projX = a.x + u * dx;
    const projY = a.y + u * dy;
    const dist = Math.hypot(click.x - projX, click.y - projY);
    if (dist < bestDist) {
      bestDist = dist;
      bestPoint = { x: projX, y: projY };
      bestT = (accLen + u * segLens[i]!) / totalLen;
      bestSegIdx = i;
    }
    accLen += segLens[i]!;
  }
  return {
    t: bestT,
    point: bestPoint,
    distance: bestDist,
    segmentIndex: bestSegIdx,
  };
}
