/**
 * Phase 12.2 — Engineer-facing dimension formatting.
 *
 * Pure helpers for the AutoCAD-style live dimension HUD. Centralised
 * so the same precision rules apply everywhere (HUD overlay, persistent
 * pipe labels, Inspector readouts).
 *
 * Precision standards (per architectural decision 12 in Phase 12 v2):
 *   - Length: 0.01 m precision generally
 *     - Below 1 m: keep 2 decimals ("0.85 м")
 *     - 1-100 m: 2 decimals ("12.34 м")
 *     - Above 100 m: integer ("234 м")
 *   - Angle: 0.1° precision ("37.5°")
 *
 * Cardinal direction (Mongolian 8-point compass):
 *   Х (Хойд) = N      ХЗ (Хойд-Зүүн) = NE
 *   З (Зүүн) = E      УЗ (Урд-Зүүн)  = SE
 *   У (Урд)  = S      УБ (Урд-Баруун) = SW
 *   Б (Баруун) = W    ХБ (Хойд-Баруун) = NW
 *
 * Angle convention: SVG coordinate space — Y increases DOWNWARD. Standard
 * `Math.atan2(dy, dx)` gives angle in radians from +X axis (East).
 *   atan2 =   0     → East
 *   atan2 =   π/2   → South (because Y-down)
 *   atan2 =  -π/2   → North
 *   atan2 =   π     → West
 */

/** Format a length in metres for engineer-facing display.
 *  Tiered precision matches drafting convention. */
export function formatLength(meters: number): string {
  const abs = Math.abs(meters);
  if (abs >= 100) {
    // 100+ m: drop decimals (sub-cm precision irrelevant at trunk-line scale)
    return `${Math.round(meters)} м`;
  }
  // < 100 m (includes < 1 m): 2 decimal places (0.01 m / 1 cm precision)
  return `${meters.toFixed(2)} м`;
}

/** Format an angle in degrees with 0.1° precision. */
export function formatAngle(degrees: number): string {
  // Normalize to (-180, 180] so we don't display weird "359.9°" labels
  let d = degrees % 360;
  if (d <= -180) d += 360;
  if (d > 180) d -= 360;
  return `${d.toFixed(1)}°`;
}

/** Cardinal direction codes used in the 8-point Mongolian compass. */
export type CardinalCode = "Х" | "ХЗ" | "З" | "УЗ" | "У" | "УБ" | "Б" | "ХБ";

/** Engineer-facing labels for tooltip / full-name display. */
export const CARDINAL_FULL_LABEL: Record<CardinalCode, string> = {
  Х: "Хойд",
  ХЗ: "Хойд-Зүүн",
  З: "Зүүн",
  УЗ: "Урд-Зүүн",
  У: "Урд",
  УБ: "Урд-Баруун",
  Б: "Баруун",
  ХБ: "Хойд-Баруун",
};

/**
 * Map an SVG-space angle (radians from atan2(dy, dx) with Y-down) to a
 * Mongolian cardinal code. The 8-way wedge splits the full circle into
 * 45° segments centred on each cardinal point.
 *
 * Returns one of 8 codes. Output is stable on the boundary (e.g. exactly
 * 22.5° resolves to ХЗ, not З).
 */
export function cardinalDirection(angleRad: number): CardinalCode {
  // Convert to degrees in [0, 360)
  let deg = (angleRad * 180) / Math.PI;
  while (deg < 0) deg += 360;
  while (deg >= 360) deg -= 360;
  // In SVG (Y-down):
  //   0°   = East   = З
  //   45°  = SE     = УЗ
  //   90°  = South  = У
  //   135° = SW     = УБ
  //   180° = West   = Б
  //   225° = NW     = ХБ
  //   270° = North  = Х
  //   315° = NE     = ХЗ
  // Wedge boundaries at 22.5° offsets so each cardinal sits at the centre.
  // Add half-wedge then integer-divide to get the wedge index 0..7.
  const wedge = Math.floor(((deg + 22.5) % 360) / 45);
  const ORDER: CardinalCode[] = ["З", "УЗ", "У", "УБ", "Б", "ХБ", "Х", "ХЗ"];
  return ORDER[wedge]!;
}

/** Pre-formatted convenience: distance + angle + cardinal in one line.
 *  Used by the HUD overlay. Format: "12.34 м · 37.5° З" */
export function formatLiveDimensionLine(
  meters: number,
  angleRad: number,
): string {
  const deg = (angleRad * 180) / Math.PI;
  const card = cardinalDirection(angleRad);
  return `${formatLength(meters)} · ${formatAngle(deg)} ${card}`;
}

/** HUD positioning policy. Returns top/left in viewport pixels with
 *  edge-aware flipping. Caller supplies cursor position + viewport
 *  dimensions + estimated HUD size.
 *
 *  Default: 12px down-right offset. Flips to up-left when within
 *  100px of right or bottom viewport edges so the HUD never goes
 *  off-screen.
 */
export function hudPlacement(
  cursor: { x: number; y: number },
  viewport: { width: number; height: number },
  hudSize: { width: number; height: number } = { width: 180, height: 80 },
): { left: number; top: number } {
  const OFFSET = 12;
  const EDGE_THRESHOLD = 100;
  // Default: down-right of cursor
  let left = cursor.x + OFFSET;
  let top = cursor.y + OFFSET;
  // Flip horizontally when within 100px of right edge
  if (cursor.x + EDGE_THRESHOLD + hudSize.width > viewport.width) {
    left = cursor.x - OFFSET - hudSize.width;
  }
  // Flip vertically when within 100px of bottom edge
  if (cursor.y + EDGE_THRESHOLD + hudSize.height > viewport.height) {
    top = cursor.y - OFFSET - hudSize.height;
  }
  // Clamp into viewport (defensive, e.g. tiny viewport edge case)
  left = Math.max(2, Math.min(left, viewport.width - hudSize.width - 2));
  top = Math.max(2, Math.min(top, viewport.height - hudSize.height - 2));
  return { left, top };
}
