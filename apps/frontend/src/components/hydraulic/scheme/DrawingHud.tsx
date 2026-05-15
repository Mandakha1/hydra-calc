/**
 * Phase 12.2 — Live AutoCAD-style dimension HUD.
 *
 * Floating DOM overlay that appears next to the cursor during active
 * drawing operations (pipe placement, building polygon, measurement).
 * Shows:
 *   - Distance from the active anchor
 *   - Angle from horizontal (signed °)
 *   - Mongolian 8-point cardinal direction code (Х/ХЗ/З/УЗ/У/УБ/Б/ХБ)
 *
 * Positioning is edge-aware: defaults to 12px down-right of cursor,
 * flips to up-left when within 100px of viewport right/bottom edges
 * so the HUD never spills off-screen.
 *
 * SEPARATE from the existing inline SVG live-text (which Phase 6.x
 * rendered at the cursor in scheme-space). This HUD is in viewport-
 * space (DOM), edge-aware, and uses centralised precision rules from
 * `dimensionFormat.ts`.
 *
 * Performance: the parent (SchemeEditor) decides when to render this
 * (only during draw mode + when cursor is over canvas), so we don't
 * need a separate render-skip optimisation inside.
 */
import type { CSSProperties } from "react";
import {
  formatLength,
  formatAngle,
  cardinalDirection,
  CARDINAL_FULL_LABEL,
  hudPlacement,
} from "./dimensionFormat";

export interface DrawingHudProps {
  /** Cursor position in viewport pixels (NOT scheme-space). */
  cursorViewport: { x: number; y: number };
  /** Viewport dimensions for edge-aware positioning. */
  viewport: { width: number; height: number };
  /** Distance from anchor in metres (already converted from scheme-px). */
  distance_m: number;
  /** Angle in radians from atan2(dy, dx) in SVG (Y-down) coords.
   *  When omitted (e.g. first vertex of polygon — no anchor yet)
   *  the HUD shows only the distance row. */
  angleRad?: number;
  /** Optional kind label so the HUD can show context ("Хоолой зурж байна").
   *  Free-text — Mongolian-friendly. */
  modeLabel?: string;
}

/**
 * Floating HUD rendered at the document-level. Pure presentational —
 * no store / no event handlers. Parent passes the live values + cursor.
 */
export function DrawingHud(props: DrawingHudProps) {
  const { cursorViewport, viewport, distance_m, angleRad, modeLabel } = props;

  // Edge-aware placement
  const HUD_SIZE = { width: 180, height: angleRad === undefined ? 56 : 86 };
  const placement = hudPlacement(cursorViewport, viewport, HUD_SIZE);

  const hasAngle = typeof angleRad === "number";
  const card = hasAngle ? cardinalDirection(angleRad) : null;
  const angleDeg = hasAngle ? (angleRad * 180) / Math.PI : 0;

  return (
    <div
      style={{
        ...hudStyle,
        left: placement.left,
        top: placement.top,
        width: HUD_SIZE.width,
      }}
      data-testid="drawing-hud"
      aria-hidden
    >
      {modeLabel && (
        <div style={modeLabelStyle} data-testid="drawing-hud-mode">
          {modeLabel}
        </div>
      )}
      <div style={lengthRowStyle} data-testid="drawing-hud-length">
        <span style={lengthMarkerStyle}>L</span>
        <span style={lengthValueStyle}>{formatLength(distance_m)}</span>
      </div>
      {hasAngle && card && (
        <div style={angleRowStyle} data-testid="drawing-hud-angle">
          <span style={angleMarkerStyle}>∠</span>
          <span style={angleValueStyle}>{formatAngle(angleDeg)}</span>
          <span
            style={cardinalStyle}
            title={CARDINAL_FULL_LABEL[card]}
            data-testid="drawing-hud-cardinal"
          >
            {card}
          </span>
        </div>
      )}
    </div>
  );
}

/* ─── Styles ────────────────────────────────────────────────────── */

const hudStyle: CSSProperties = {
  position: "fixed",
  zIndex: 100,
  pointerEvents: "none",
  background: "rgba(20, 24, 32, 0.92)",
  color: "#f6f0dd",
  border: "1px solid var(--accent, #1f5faa)",
  borderRadius: 6,
  padding: "6px 10px",
  fontSize: 12,
  fontFamily: "var(--font-mono, monospace)",
  boxShadow: "0 4px 16px rgba(0,0,0,0.35)",
  lineHeight: 1.45,
  userSelect: "none",
};

const modeLabelStyle: CSSProperties = {
  fontSize: 10,
  color: "rgba(246, 240, 221, 0.7)",
  marginBottom: 2,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
};

const lengthRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  gap: 6,
};

const lengthMarkerStyle: CSSProperties = {
  fontSize: 10,
  color: "var(--accent, #1f5faa)",
  fontWeight: 700,
  width: 12,
};

const lengthValueStyle: CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  color: "#fff",
};

const angleRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  gap: 6,
  marginTop: 2,
};

const angleMarkerStyle: CSSProperties = {
  fontSize: 10,
  color: "var(--accent, #1f5faa)",
  fontWeight: 700,
  width: 12,
};

const angleValueStyle: CSSProperties = {
  fontSize: 13,
  color: "#fff",
};

const cardinalStyle: CSSProperties = {
  marginLeft: "auto",
  background: "var(--accent, #1f5faa)",
  color: "#fff",
  fontSize: 11,
  fontWeight: 700,
  padding: "1px 6px",
  borderRadius: 3,
  cursor: "help",
};
