/**
 * Phase 6.7.1 — Scale bar helpers (pure functions).
 *
 * Drafting-scale math + paper-dimension lookup + segment generator.
 * No DOM, no React — fully testable.
 *
 * Background:
 *   Mongolian engineering drawings declare a fixed scale (1:200,
 *   1:500, 1:1000, 1:2000 by convention). The on-canvas ScaleBar
 *   widget renders graduations matching that declared scale so an
 *   engineer can verify "yes this 50m bar = 100mm at 1:500".
 *
 *   The same numbers feed the PDF exporter (Phase 6.7.4) — paper
 *   dimensions, segment positions in mm, scale label string all flow
 *   through these helpers so the on-canvas widget + the print page
 *   stay in sync.
 *
 * Coordinate conventions:
 *   - All paper measurements in millimetres (mm).
 *   - "Scale 1:500" → 1 cm on paper = 5 m in reality
 *     → metresPerCentimetre("1:500") === 5
 *   - Scheme-space (canvas) coords use PX_PER_METER = 20 (see
 *     nodeCatalog.ts). The ScaleBar component multiplies metreValue
 *     by PX_PER_METER (when not on a map) or by mapPxPerMeter (when
 *     on a map) to lay out ticks on screen.
 */

import { PX_PER_METER } from "../nodeCatalog";

/** Standard drafting scales supported in 6.7. Adding 1:5000 / 1:10000
 *  would be a Phase 11 extension (large district networks). */
export const STANDARD_SCALES = ["1:200", "1:500", "1:1000", "1:2000"] as const;
export type StandardScale = (typeof STANDARD_SCALES)[number];

export type PaperSize = "A3" | "A4";
export type PaperOrientation = "portrait" | "landscape";

/** Default scale when a project hasn't set one. Picked to fit a
 *  ~150 m residential network on A3 landscape with margin. */
export const DEFAULT_SCALE: StandardScale = "1:500";
export const DEFAULT_PAPER_SIZE: PaperSize = "A3";
export const DEFAULT_PAPER_ORIENTATION: PaperOrientation = "landscape";

/** ISO 216 base dimensions in millimetres (short × long). */
const PAPER_BASE_MM: Record<PaperSize, { short: number; long: number }> = {
  A4: { short: 210, long: 297 },
  A3: { short: 297, long: 420 },
};

/** Paper dimensions (mm) for the given size + orientation. */
export function paperDimensionsMm(
  size: PaperSize,
  orientation: PaperOrientation,
): { width: number; height: number } {
  const base = PAPER_BASE_MM[size];
  return orientation === "landscape"
    ? { width: base.long, height: base.short }
    : { width: base.short, height: base.long };
}

/** Parse the "N" out of a "1:N" scale string. */
export function parseScale(scale: StandardScale): number {
  const parts = scale.split(":");
  return Number(parts[1]);
}

/** Metres of real distance represented by 1 cm on paper at the given
 *  scale. e.g. "1:500" → 5 (because 500 cm = 5 m per paper cm). */
export function metresPerCentimetre(scale: StandardScale): number {
  return parseScale(scale) / 100;
}

/**
 * Pick the nearest standard drafting scale given the current Leaflet
 * map view's `pxPerMeter`. The conversion uses a 96 DPI assumption
 * (1 inch = 25.4 mm = 96 px on a typical screen).
 *
 * Used for the "your current map zoom looks like ~1:500" UI hint
 * and as a default when the engineer toggles to map view without
 * having set a print scale yet.
 *
 * Returns the closest match by log-distance — so 1:600 picks 1:500,
 * 1:1500 picks 1:1000 (both within ~20% multiplicative error).
 */
export function nearestStandardScale(
  pxPerMeter: number,
  screenDpi: number = 96,
): StandardScale {
  const pxPerCm = screenDpi / 2.54;
  // metresPerCm * 100 = "N" in 1:N
  const metresPerCm = pxPerCm / pxPerMeter;
  const ratio = metresPerCm * 100;
  let best: StandardScale = STANDARD_SCALES[0];
  let bestDist = Infinity;
  for (const s of STANDARD_SCALES) {
    const standardN = parseScale(s);
    const dist = Math.abs(Math.log(ratio / standardN));
    if (dist < bestDist) {
      bestDist = dist;
      best = s;
    }
  }
  return best;
}

/** One graduation segment of the scale bar. */
export interface ScaleBarSegment {
  /** Metre value at this tick mark (0, step, 2*step, …). */
  metreValue: number;
  /** Position along the bar in millimetres (from left edge). */
  lengthOnPaper_mm: number;
}

/** "Nice round" step sizes for the segment generator. */
const NICE_STEPS_M = [1, 2, 5, 10, 20, 25, 50, 100, 200, 500];

/**
 * Compute graduation ticks for a scale bar that takes ~20% of the
 * paper width and uses a nice round step (1/2/5/10/… metres).
 *
 * Always returns 5 entries (0 + 4 segments), so the rendered bar has
 * 4 visible "steps" with 5 ticks (including the 0 mark).
 *
 * Example: scale "1:500", paperWidth 420 mm (A3 landscape)
 *   - Target bar length: 84 mm
 *   - 1 cm on paper = 5 m → 84 mm = 42 m
 *   - Step = 42 / 4 ≈ 10 m → snap to nice step 10
 *   - Segments: [0m, 10m, 20m, 30m, 40m] at [0, 20, 40, 60, 80] mm
 */
export function scaleBarSegments(
  scale: StandardScale,
  paperWidth_mm: number,
): ScaleBarSegment[] {
  const mPerCm = metresPerCentimetre(scale);
  // ~20% of paper width, but cap at 120 mm so it doesn't dominate big
  // paper or shrink uselessly on small paper.
  const targetBarLen_mm = Math.min(120, Math.max(40, paperWidth_mm * 0.2));
  // Target total metres on the bar.
  const targetTotalMetres = (targetBarLen_mm / 10) * mPerCm;
  // Pick a nice step so 4 * step ≈ targetTotalMetres.
  const targetStep = targetTotalMetres / 4;
  let step = NICE_STEPS_M[0]!;
  for (const s of NICE_STEPS_M) {
    if (s <= targetStep) {
      step = s;
    } else {
      break;
    }
  }
  const segments: ScaleBarSegment[] = [];
  for (let i = 0; i <= 4; i += 1) {
    const metreValue = i * step;
    segments.push({
      metreValue,
      lengthOnPaper_mm: (metreValue / mPerCm) * 10,
    });
  }
  return segments;
}

/**
 * Pick the smallest standard scale that fits the given drawing bbox
 * onto the chosen paper, accounting for margins reserved for the
 * title block + scale bar + north arrow.
 *
 * "Smallest" = smallest "N" in "1:N", i.e. the largest visual scale.
 * If the drawing doesn't fit at any standard scale, the largest
 * standard scale ("1:2000") is returned and the caller should warn
 * the engineer.
 *
 * @param bbox_px            Drawing bbox in scheme-space pixels.
 * @param paperSize          Paper size choice.
 * @param orientation        Paper orientation choice.
 * @param reservedMargin_mm  Total reserved margin (left + right and
 *                           top + bottom combined) for title block
 *                           etc. Default 60 mm — typical A3 layout.
 */
export function fitToPageScale(
  bbox_px: { width: number; height: number },
  paperSize: PaperSize,
  orientation: PaperOrientation,
  reservedMargin_mm: number = 60,
): StandardScale {
  const paperDims = paperDimensionsMm(paperSize, orientation);
  const availableWidth_mm = paperDims.width - reservedMargin_mm;
  const availableHeight_mm = paperDims.height - reservedMargin_mm;
  // Convert bbox from scheme pixels to metres via the canvas constant.
  const bboxWidth_m = bbox_px.width / PX_PER_METER;
  const bboxHeight_m = bbox_px.height / PX_PER_METER;
  for (const scale of STANDARD_SCALES) {
    const mPerCm = metresPerCentimetre(scale);
    const w_mm = (bboxWidth_m / mPerCm) * 10;
    const h_mm = (bboxHeight_m / mPerCm) * 10;
    if (w_mm <= availableWidth_mm && h_mm <= availableHeight_mm) {
      return scale;
    }
  }
  // Drawing exceeds all standard scales — caller is expected to toast.
  return STANDARD_SCALES[STANDARD_SCALES.length - 1] as StandardScale;
}

/**
 * Compute the scheme-space pixel length of a scale-bar segment for
 * the on-canvas widget. Independent of `paperWidth_mm` — uses the
 * scheme's PX_PER_METER constant (or a caller-provided value when
 * a map is active and pixel density follows zoom).
 */
export function segmentLengthInSchemePx(
  metreValue: number,
  pxPerMeter: number = PX_PER_METER,
): number {
  return metreValue * pxPerMeter;
}
