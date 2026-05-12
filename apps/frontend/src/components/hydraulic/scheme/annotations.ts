/**
 * Phase 6.6.3 — Text annotation helpers (pure functions).
 *
 * Math + rendering helpers; store mutations live in
 * `./annotationApplier.ts` (applier pattern from Phase 6.5 — no new
 * StoreActions added).
 *
 * Pieces:
 *   - annotationLines(annotation): split text on newlines.
 *   - annotationBoundingBox(annotation): axis-aligned bounding box in
 *     SVG-pixel space WITHOUT considering rotation. Used by rubber-
 *     band hit-test (rotation makes a true OBB expensive — engineers
 *     accept the simpler hit zone).
 *   - estimateTextWidthPx(text, fontSize_px): rough monospace-ish
 *     width estimate without DOM measurement. Good enough for hit-
 *     zones; the actual visual width on render is whatever the SVG
 *     `<text>` engine produces.
 *   - translateAnnotations / rotateAnnotations / mirrorAnnotations:
 *     pure transform helpers analogous to transforms.ts for nodes,
 *     but operating on the annotation's anchor + rotation_deg.
 */

import type { SchemeAnnotation } from "../hydraulicTypes";
import type { MirrorAxis } from "./transforms";

/** Default font size in SVG pixels when an annotation hasn't set it. */
export const DEFAULT_FONT_SIZE_PX = 12;
/** Default line height multiplier — typical CAD-text leading. */
export const LINE_HEIGHT_MULTIPLIER = 1.2;

/** Split an annotation's text into lines for multi-line rendering. */
export function annotationLines(annotation: SchemeAnnotation): string[] {
  return (annotation.text ?? "").split(/\r?\n/);
}

/** Effective font size (with default fallback). */
export function effectiveFontSize(annotation: SchemeAnnotation): number {
  return annotation.fontSize_px ?? DEFAULT_FONT_SIZE_PX;
}

/**
 * Rough width estimate without DOM. Assumes an average glyph width of
 * ~0.6 × fontSize (Manrope / Inter / system defaults sit close to this
 * ratio). Empty lines collapse to 0 so single-character entries don't
 * inflate the box.
 */
export function estimateTextWidthPx(text: string, fontSize_px: number): number {
  return text.length === 0 ? 0 : text.length * fontSize_px * 0.6;
}

/**
 * Axis-aligned bounding box of an annotation in scheme-pixel space.
 *
 * Treats `rotation_deg` as 0 — engineers using rubber-band selection
 * expect to lasso annotations by their *unrotated* footprint. A true
 * rotated bounding box (OBB) test would block legitimate clicks when
 * the engineer drags a rectangle over a rotated label whose centre
 * is inside the rect. The simpler test feels right in practice.
 *
 * Alignment shifts the box horizontally so that the chosen alignment
 * point sits at (annotation.x, annotation.y):
 *   - left:   text starts at x
 *   - center: text is centred on x
 *   - right:  text ends at x
 */
export function annotationBoundingBox(
  annotation: SchemeAnnotation,
): { minX: number; minY: number; maxX: number; maxY: number } {
  const lines = annotationLines(annotation);
  const fs = effectiveFontSize(annotation);
  const maxLineWidth = lines.reduce(
    (acc, ln) => Math.max(acc, estimateTextWidthPx(ln, fs)),
    0,
  );
  const totalHeight = lines.length * fs * LINE_HEIGHT_MULTIPLIER;
  const align = annotation.align ?? "left";
  let minX: number;
  let maxX: number;
  if (align === "center") {
    minX = annotation.x - maxLineWidth / 2;
    maxX = annotation.x + maxLineWidth / 2;
  } else if (align === "right") {
    minX = annotation.x - maxLineWidth;
    maxX = annotation.x;
  } else {
    minX = annotation.x;
    maxX = annotation.x + maxLineWidth;
  }
  // Y anchor sits at the baseline of the first line in SVG; the box
  // climbs upward by one ascent plus extends downward through the
  // remaining lines. Engineers expect the box to roughly surround the
  // visible text — overestimating by a few px is fine.
  const minY = annotation.y - fs;
  const maxY = annotation.y + Math.max(0, totalHeight - fs);
  return { minX, minY, maxX, maxY };
}

/** Anchor of the annotation — single point used by transforms +
 *  rubber-band hit-tests that prefer a point over a box. */
export function annotationAnchor(annotation: SchemeAnnotation): { x: number; y: number } {
  return { x: annotation.x, y: annotation.y };
}

/* ─── Transforms ──────────────────────────────────────────────────── */

/**
 * Translate every annotation by the same pixel delta. The rotation
 * field is untouched.
 */
export function translateAnnotations(
  annotations: SchemeAnnotation[],
  delta_px: { x: number; y: number },
): SchemeAnnotation[] {
  return annotations.map((a) => ({
    ...a,
    x: Math.round(a.x + delta_px.x),
    y: Math.round(a.y + delta_px.y),
  }));
}

/**
 * Rotate every annotation around a pixel-space centre by `angleDeg`.
 * Positive angle = counter-clockwise (matches transforms.ts).
 * The annotation's own `rotation_deg` is incremented by the same
 * `angleDeg` so the text reads at the new orientation.
 */
export function rotateAnnotations(
  annotations: SchemeAnnotation[],
  center_px: { x: number; y: number },
  angleDeg: number,
): SchemeAnnotation[] {
  const theta = (angleDeg * Math.PI) / 180;
  const cosT = Math.cos(theta);
  const sinT = Math.sin(theta);
  return annotations.map((a) => {
    const dx = a.x - center_px.x;
    const dy = a.y - center_px.y;
    return {
      ...a,
      x: Math.round(center_px.x + dx * cosT - dy * sinT),
      y: Math.round(center_px.y + dx * sinT + dy * cosT),
      rotation_deg: (a.rotation_deg ?? 0) + angleDeg,
    };
  });
}

/**
 * Reflect every annotation across the given axis. Horizontal flip
 * sends rotation θ → −θ (the text would appear upside-down after a
 * naive flip; we re-flip via the negated angle). Vertical flip sends
 * θ → 180° − θ for the same reason. Line-axis reflections share the
 * point-reflection math from transforms.ts and zero the rotation
 * sign similarly via the 2× foot − point identity.
 */
export function mirrorAnnotations(
  annotations: SchemeAnnotation[],
  axis: MirrorAxis,
): SchemeAnnotation[] {
  return annotations.map((a) => {
    const cloned: SchemeAnnotation = { ...a };
    const rot = a.rotation_deg ?? 0;
    if (axis.kind === "horizontal") {
      cloned.y = Math.round(2 * axis.y_px - a.y);
      cloned.rotation_deg = -rot;
    } else if (axis.kind === "vertical") {
      cloned.x = Math.round(2 * axis.x_px - a.x);
      cloned.rotation_deg = 180 - rot;
    } else {
      // 2-point line reflection.
      const dx = axis.b_px.x - axis.a_px.x;
      const dy = axis.b_px.y - axis.a_px.y;
      const denom = dx * dx + dy * dy;
      if (denom < 1e-9) return cloned;
      const px = a.x - axis.a_px.x;
      const py = a.y - axis.a_px.y;
      const t = (px * dx + py * dy) / denom;
      const footX = axis.a_px.x + t * dx;
      const footY = axis.a_px.y + t * dy;
      cloned.x = Math.round(2 * footX - a.x);
      cloned.y = Math.round(2 * footY - a.y);
      // Reflecting the rotation across a line at angle φ:
      //   new_rot = 2φ − rot
      const phi_deg = (Math.atan2(dy, dx) * 180) / Math.PI;
      cloned.rotation_deg = 2 * phi_deg - rot;
    }
    return cloned;
  });
}
