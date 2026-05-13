/**
 * Phase 6.7.3 — NorthArrow SVG widget.
 *
 * Drafting-style north marker with the Mongolian "Н" (Хойт) letter
 * at the top of a triangular arrow. Rendered viewport-anchored
 * (outside the pan/zoom transform group) so it stays put at the
 * configured corner regardless of canvas pan / zoom.
 *
 * Sized in millimetres via the `mmToPx` prop so the same component
 * is reused by the PDF exporter (Phase 6.7.4) at true paper scale.
 *
 * Engineer interactions:
 *   - Click in select mode → store dispatches
 *     `select({ kind: "northArrow", id: "" })`
 *   - Drag (mousedown on arrow → mousemove → mouseup) →
 *     updateSettings({ northArrow: { x_px, y_px, ... } })
 *   - Inspector slider → updateSettings({ northArrow: { rotation_deg, ... } })
 */

import type { MouseEvent as ReactMouseEvent } from "react";
import {
  NORTH_ARROW_VISUAL_MM,
  NORTH_ARROW_ASPECT,
  northArrowBoundingBox,
} from "./northArrowMeta";

interface Props {
  /** Top-left corner of the arrow in VIEWPORT pixels. Caller has
   *  already applied defaults / clamping. */
  x_px: number;
  y_px: number;
  /** Rotation about the arrow's centre, in degrees. Positive =
   *  clockwise (drafting convention). */
  rotation_deg: number;
  /** Conversion factor from arrow-millimetres to viewport pixels.
   *  Canvas preview uses 2.5 (so the marker is ~30 px tall); the
   *  PDF exporter (Phase 6.7.4) will use the real mm-to-pt factor. */
  mmToPx: number;
  /** Visual feedback when selected — gold dashed outline. */
  isSelected?: boolean;
  /** Mouse-down handler — caller uses this to initiate drag and
   *  to dispatch `select({ kind: "northArrow", id: "" })`. */
  onMouseDown?: (e: ReactMouseEvent<SVGGElement>) => void;
}

export function NorthArrow({
  x_px,
  y_px,
  rotation_deg,
  mmToPx,
  isSelected = false,
  onMouseDown,
}: Props) {
  const height = NORTH_ARROW_VISUAL_MM * mmToPx;
  const width = height * NORTH_ARROW_ASPECT;
  const cx = x_px + width / 2;
  const cy = y_px + height / 2;
  const bb = northArrowBoundingBox(x_px, y_px, mmToPx);

  // Triangle vertices (unrotated, anchored at top-left x/y).
  // Top apex sits ~1.5 letter-heights below the "Н" label so the
  // letter doesn't collide with the arrowhead.
  const letterArea = height * 0.28;
  const apex = { x: cx, y: y_px + letterArea };
  const baseLeft = { x: x_px + width * 0.18, y: y_px + height };
  const baseRight = { x: x_px + width * 0.82, y: y_px + height };
  // Inner notch at the base for the "double-pointed" drafting style.
  const baseMid = { x: cx, y: y_px + height * 0.78 };

  return (
    <g
      data-testid="north-arrow"
      transform={`rotate(${rotation_deg} ${cx} ${cy})`}
      onMouseDown={onMouseDown}
      style={{ cursor: onMouseDown ? "grab" : undefined }}
    >
      {/* Selected outline — drawn first so it sits behind the arrow */}
      {isSelected && (
        <rect
          x={bb.minX - 3}
          y={bb.minY - 3}
          width={bb.width + 6}
          height={bb.height + 6}
          fill="none"
          stroke="#FFB300"
          strokeWidth={1.5}
          strokeDasharray="3 2"
          pointerEvents="none"
        />
      )}
      {/* "Н" label (Хойт / North) at the top */}
      <text
        x={cx}
        y={y_px + letterArea * 0.85}
        fontSize={letterArea * 0.9}
        fontFamily="var(--font-mono, monospace)"
        fontWeight={700}
        fill="#222"
        stroke="white"
        strokeWidth={Math.max(2, letterArea * 0.15)}
        paintOrder="stroke"
        textAnchor="middle"
        pointerEvents="none"
      >
        Н
      </text>
      {/* Filled half of the arrow (left = dark) */}
      <polygon
        points={`${apex.x},${apex.y} ${baseLeft.x},${baseLeft.y} ${baseMid.x},${baseMid.y}`}
        fill="#222"
        stroke="#222"
        strokeWidth={0.8}
      />
      {/* Unfilled half (right = light) — drafting convention */}
      <polygon
        points={`${apex.x},${apex.y} ${baseRight.x},${baseRight.y} ${baseMid.x},${baseMid.y}`}
        fill="white"
        stroke="#222"
        strokeWidth={0.8}
      />
    </g>
  );
}
