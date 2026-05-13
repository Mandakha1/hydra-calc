/**
 * Phase 6.7.3 — North-arrow helpers (pure functions).
 *
 * Defaults + click hit-test for the singleton north marker.
 *
 * The arrow is rendered viewport-anchored (outside the SVG's pan/
 * zoom transform) so its position is in VIEWPORT pixels, not
 * scheme-space coordinates. Persisted position is therefore the
 * exact `(x_px, y_px)` of the arrow's TOP-LEFT corner in viewport
 * space — a simple mental model that doesn't depend on canvas
 * pan / zoom state at render time.
 *
 * Reused across the canvas preview (Phase 6.7.3) and the PDF
 * exporter (Phase 6.7.4) via a shared `NORTH_ARROW_VISUAL_MM`
 * conversion — same arrow size on a 297-mm paper as on the canvas
 * (modulo the mm-to-px scaling applied by the renderer).
 */

import type { NorthArrowMeta } from "../hydraulicTypes";

/** Visual height of the north arrow in MILLIMETRES on a printed
 *  page. The renderer multiplies by its `mmToPx` factor: at 2.5
 *  (canvas preview) the arrow is ~30 px tall; at the real
 *  paper-mm-to-PDF-pt conversion (Phase 6.7.4) it stays the same
 *  12 mm on the printed sheet. */
export const NORTH_ARROW_VISUAL_MM = 12;
/** Aspect ratio (tall:wide). A 12-mm arrow renders ~9 mm wide. */
export const NORTH_ARROW_ASPECT = 0.75;
/** Padding from the viewport corner (px) for the default position. */
export const NORTH_ARROW_CORNER_PADDING_PX = 20;
/** Default canvas-preview render scale (mm → px). The PDF exporter
 *  will use the real conversion in Phase 6.7.4. */
export const NORTH_ARROW_CANVAS_MMTOPX = 2.5;

/**
 * Default position of the north arrow's top-left corner — viewport
 * top-right with `NORTH_ARROW_CORNER_PADDING_PX` margin. Returns
 * (0, padding) for a zero-width viewport (defensive — caller should
 * not render before the ResizeObserver populates dimensions).
 */
export function defaultNorthArrowPosition(
  viewportWidth_px: number,
  viewportHeight_px: number,
  mmToPx: number = NORTH_ARROW_CANVAS_MMTOPX,
): { x_px: number; y_px: number } {
  void viewportHeight_px; // height not used for top-right corner
  const widthPx = NORTH_ARROW_VISUAL_MM * NORTH_ARROW_ASPECT * mmToPx;
  return {
    x_px: Math.max(0, viewportWidth_px - widthPx - NORTH_ARROW_CORNER_PADDING_PX),
    y_px: NORTH_ARROW_CORNER_PADDING_PX,
  };
}

/** Defaulted view of NorthArrowMeta — every field guaranteed
 *  non-undefined. Caller passes the live viewport dims so the
 *  arrow lands top-right on first render. */
export interface DefaultedNorthArrow {
  x_px: number;
  y_px: number;
  rotation_deg: number;
}

/** Fill missing fields using `defaultNorthArrowPosition`. */
export function applyNorthArrowDefaults(
  meta: NorthArrowMeta | undefined,
  viewportWidth_px: number,
  viewportHeight_px: number,
  mmToPx: number = NORTH_ARROW_CANVAS_MMTOPX,
): DefaultedNorthArrow {
  const m = meta ?? {};
  const def = defaultNorthArrowPosition(viewportWidth_px, viewportHeight_px, mmToPx);
  return {
    x_px: m.x_px ?? def.x_px,
    y_px: m.y_px ?? def.y_px,
    rotation_deg: m.rotation_deg ?? 0,
  };
}

/**
 * Bounding box of the rendered arrow at the given top-left position.
 * Used by both the click hit-test and the InspectorPanel "where is
 * it on the page" readout.
 */
export function northArrowBoundingBox(
  x_px: number,
  y_px: number,
  mmToPx: number = NORTH_ARROW_CANVAS_MMTOPX,
): { minX: number; minY: number; maxX: number; maxY: number; width: number; height: number } {
  const height = NORTH_ARROW_VISUAL_MM * mmToPx;
  const width = height * NORTH_ARROW_ASPECT;
  return {
    minX: x_px,
    minY: y_px,
    maxX: x_px + width,
    maxY: y_px + height,
    width,
    height,
  };
}

/**
 * Is the given (viewport-px) point inside the arrow's bounding box?
 *
 * Note: we test the unrotated bounding box rather than the rotated
 * polygon — the visual difference is small at the arrow's typical
 * size and engineers expect a forgiving hit zone (the rotated arrow
 * is still graspable when it's rotated). This matches the
 * annotation-bbox compromise from Phase 6.6.3.
 */
export function isPointInsideNorthArrow(
  point: { x: number; y: number },
  meta: NorthArrowMeta | undefined,
  viewportWidth_px: number,
  viewportHeight_px: number,
  mmToPx: number = NORTH_ARROW_CANVAS_MMTOPX,
): boolean {
  const { x_px, y_px } = applyNorthArrowDefaults(
    meta,
    viewportWidth_px,
    viewportHeight_px,
    mmToPx,
  );
  const bb = northArrowBoundingBox(x_px, y_px, mmToPx);
  return (
    point.x >= bb.minX &&
    point.x <= bb.maxX &&
    point.y >= bb.minY &&
    point.y <= bb.maxY
  );
}

/** Clamp a candidate `(x, y)` so the arrow stays fully inside the
 *  given viewport. Used during drag to keep the marker on-screen. */
export function clampNorthArrowPosition(
  x_px: number,
  y_px: number,
  viewportWidth_px: number,
  viewportHeight_px: number,
  mmToPx: number = NORTH_ARROW_CANVAS_MMTOPX,
): { x_px: number; y_px: number } {
  const bb = northArrowBoundingBox(x_px, y_px, mmToPx);
  const maxX = Math.max(0, viewportWidth_px - bb.width);
  const maxY = Math.max(0, viewportHeight_px - bb.height);
  return {
    x_px: Math.min(Math.max(0, x_px), maxX),
    y_px: Math.min(Math.max(0, y_px), maxY),
  };
}
