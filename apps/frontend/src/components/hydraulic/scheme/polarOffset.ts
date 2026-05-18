/**
 * Phase 13.5 — AutoCAD-style polar-offset math for direct dimension
 * input.
 *
 * Engineer types LENGTH (m) + ANGLE (degrees) and the SchemeEditor
 * commits a vertex / pipe endpoint at the resulting polar offset
 * from the current anchor point. Conventions match AutoCAD:
 *
 *   - 0° points EAST (positive x).
 *   - Angle increases COUNTER-CLOCKWISE (the engineer-intuitive
 *     direction — "90° is up / north").
 *   - SVG coords are y-DOWN, so we flip the sin component when
 *     converting from polar to screen coords.
 *
 *      90°
 *       |
 *  180° + 0°
 *       |
 *      270°
 *
 * No DOM, no React. Pure math — tested in isolation via plain
 * unit tests. Caller passes `from` in scheme-pixel coords + the
 * conversion factor PX_PER_METER so the length argument can stay
 * in real-world metres (matching the Inspector / dimension UI).
 */
export interface Point2D {
  x: number;
  y: number;
}

/**
 * Compute the (x, y) destination point of a polar offset.
 *
 * @param from        Anchor in scheme-pixel coords.
 * @param length_m    Length in real-world metres (engineer-typed).
 * @param angle_deg   Angle in degrees, AutoCAD convention (0 east,
 *                    90 north, CCW positive).
 * @param pxPerMeter  Scheme-px per real-world metre (PX_PER_METER).
 * @returns           Destination in scheme-pixel coords, rounded to
 *                    0.1 px so subsequent geometry math doesn't
 *                    accumulate float drift.
 */
export function polarOffsetPoint(
  from: Point2D,
  length_m: number,
  angle_deg: number,
  pxPerMeter: number,
): Point2D {
  const length_px = length_m * pxPerMeter;
  const rad = (angle_deg * Math.PI) / 180;
  // SVG y-down: positive angle (CCW visually) → negative dy
  const dx = length_px * Math.cos(rad);
  const dy = -length_px * Math.sin(rad);
  return {
    x: Math.round((from.x + dx) * 10) / 10,
    y: Math.round((from.y + dy) * 10) / 10,
  };
}

/**
 * Inverse: compute the polar length + angle of the segment between
 * two scheme-pixel points. Used to pre-fill the engineer-facing
 * input fields with the CURRENT cursor offset so they can refine
 * one component (e.g. lock the angle, just type the length).
 *
 * Returns `length_m` rounded to 0.1 m, `angle_deg` rounded to 1°
 * (Mongolian engineering paperwork rarely needs sub-degree
 * precision; matches the live HUD's compass display).
 */
export function polarFromTwoPoints(
  from: Point2D,
  to: Point2D,
  pxPerMeter: number,
): { length_m: number; angle_deg: number } {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length_px = Math.hypot(dx, dy);
  const length_m = Math.round((length_px / pxPerMeter) * 10) / 10;
  // SVG y-down → flip sign back to AutoCAD convention
  let angle_deg = Math.round((Math.atan2(-dy, dx) * 180) / Math.PI);
  // Normalize to [0, 360) — also collapses -0 → 0 because (-0 % 360)
  // is -0, but adding 360 and re-modding lands on a positive zero.
  angle_deg = ((angle_deg % 360) + 360) % 360;
  return { length_m, angle_deg };
}

/**
 * Validate an engineer-typed dimension input. Engineers may type
 * partial values mid-keystroke ("1." / "" / "-3"); the panel should
 * only commit when the input parses to a positive real length AND
 * a finite angle. Returns null when invalid.
 */
export function parseDimensionInput(
  lengthStr: string,
  angleStr: string,
): { length_m: number; angle_deg: number } | null {
  const length_m = parseFloat(lengthStr);
  const angle_deg = parseFloat(angleStr);
  if (!Number.isFinite(length_m) || length_m <= 0) return null;
  if (!Number.isFinite(angle_deg)) return null;
  // Wrap the angle to [0, 360) so 720° → 0°, -45° → 315° etc.
  const wrapped = ((angle_deg % 360) + 360) % 360;
  return { length_m, angle_deg: wrapped };
}
