/**
 * Phase 6.7.4 — PDF export (headline feature).
 *
 * Lazy-imported from HydraulicV5 so the jspdf + svg2pdf + Cyrillic
 * TTF (~120 KB gz) sit in a separate chunk that loads only when the
 * engineer presses the "🖨 PDF" toolbar button. Mirrors the lazy-
 * import pattern from Excel / DXF / Zulu exports.
 *
 * Pipeline:
 *   1. Resolve paper dimensions + drawing area (mm).
 *   2. Initialise jsPDF with the chosen paper + orientation.
 *   3. Load the Roboto-Cyrillic TTF from a Vite asset URL, base64-
 *      encode it, and register it with jsPDF's font dictionary so
 *      Mongolian glyphs (Ө / Ү / etc.) render correctly.
 *   4. Clone the SchemeEditor's live SVG, strip elements on
 *      `printVisible: false` layers, drop the canvas-only preview
 *      widgets (their PDF copies are drawn at true paper positions
 *      below), normalise viewBox.
 *   5. Render the cloned SVG into the drawing area via svg2pdf.
 *   6. Overlay the print versions of TitleBlock / ScaleBar /
 *      NorthArrow at fixed paper-mm positions — same React
 *      components reused via the `mmToPx` prop.
 *   7. Return a Blob.
 *
 * Helpers exported for testability:
 *   - collectPrintHiddenIds: pure ID-filter
 *   - stripNonPrintElements: DOM walk
 *   - drawingAreaMm: paper-mm layout math
 *   - loadFontIntoPdf: font wiring (call site for fetch + base64)
 */

import { jsPDF } from "jspdf";
import "svg2pdf.js";
import type { HydraulicState, ProjectSettings } from "../hydraulicTypes";
import {
  DEFAULT_LAYERS,
  type LayerKey,
  resolveLayerByKey,
  resolveLayer,
  layerKeyFor,
} from "../scheme/layers";
import {
  paperDimensionsMm,
  scaleBarSegments,
  metresPerCentimetre,
  type PaperSize,
  type PaperOrientation,
  type StandardScale,
} from "../scheme/scales";
import {
  applyTitleBlockDefaults,
  titleBlockDimensionsMm,
  titleBlockRows,
  TITLE_BLOCK_PAPER_MARGIN_MM,
} from "../scheme/titleBlockMeta";
import {
  NORTH_ARROW_VISUAL_MM,
  NORTH_ARROW_ASPECT,
  NORTH_ARROW_CORNER_PADDING_PX,
} from "../scheme/northArrowMeta";

// Vite asset import — at build time this resolves to a URL like
// `/assets/Roboto-Cyrillic-<hash>.ttf`. The font file (121 KB)
// becomes part of the lazy PDF chunk thanks to dynamic import.
import robotoCyrillicUrl from "./fonts/Roboto-Cyrillic.ttf?url";

/** jsPDF font alias used throughout the PDF document. */
export const PDF_FONT_NAME = "RobotoCyr";

export interface PdfExportInputs {
  state: HydraulicState;
  settings: ProjectSettings;
  paperSize: PaperSize;
  orientation: PaperOrientation;
  scale: StandardScale;
  /** Live SVG node from SchemeEditor — caller passes svgRef.current. */
  svgElement: SVGSVGElement | null;
}

/* ─── Pure helpers (testable) ───────────────────────────────────── */

/**
 * Build per-entity-type sets of IDs that should be HIDDEN in the PDF
 * because their layer's `printVisible` flag is false.
 *
 * Pipes are NOT filtered here — engineering convention is to always
 * show the network on the printed page. Future Phase 11 polish can
 * extend this to filter pipes via `pipe.circuit → layerKeyFor`.
 */
export function collectPrintHiddenIds(
  state: HydraulicState,
  settings: ProjectSettings,
): {
  dimensionIds: Set<string>;
  constructionLineIds: Set<string>;
  annotationIds: Set<string>;
} {
  const hidden = {
    dimensionIds: new Set<string>(),
    constructionLineIds: new Set<string>(),
    annotationIds: new Set<string>(),
  };
  const isPrintVisible = (key: LayerKey): boolean => {
    const def = DEFAULT_LAYERS[key];
    const override = settings.layers?.[key];
    return override?.printVisible ?? def.printVisible;
  };
  for (const d of state.dimensions ?? []) {
    const key = (d.layerKey ?? "D") as LayerKey;
    if (!isPrintVisible(key)) hidden.dimensionIds.add(d.id);
  }
  for (const c of state.constructionLines ?? []) {
    const key = (c.layerKey ?? "C") as LayerKey;
    if (!isPrintVisible(key)) hidden.constructionLineIds.add(c.id);
  }
  for (const a of state.annotations ?? []) {
    const key = (a.layerKey ?? "D") as LayerKey;
    if (!isPrintVisible(key)) hidden.annotationIds.add(a.id);
  }
  return hidden;
}

/**
 * Mutate `clone` to remove:
 *   - drafting-aid elements whose IDs are in the hidden sets
 *   - the canvas-only preview widgets (their PDF copies are drawn
 *     at the true paper-mm positions in the renderer below)
 */
export function stripNonPrintElements(
  clone: SVGSVGElement,
  hidden: ReturnType<typeof collectPrintHiddenIds>,
): void {
  for (const id of hidden.dimensionIds) {
    clone.querySelector(`[data-testid="dimension-${id}"]`)?.remove();
  }
  for (const id of hidden.constructionLineIds) {
    clone.querySelector(`[data-testid="construction-line-${id}"]`)?.remove();
  }
  for (const id of hidden.annotationIds) {
    clone.querySelector(`[data-testid="annotation-${id}"]`)?.remove();
  }
  // Always strip the canvas-preview widgets — the PDF renderer
  // draws fresh ones at fixed paper-mm positions.
  clone.querySelector('[data-testid="scale-bar"]')?.remove();
  clone.querySelector('[data-testid="title-block"]')?.remove();
  clone.querySelector('[data-testid="north-arrow"]')?.remove();
}

/**
 * Drawing area on the paper, in millimetres. Outer margin is 10 mm
 * on all sides; the renderer also reserves the bottom-right corner
 * for the title block and the top-right for the north arrow.
 */
export function drawingAreaMm(
  paperSize: PaperSize,
  orientation: PaperOrientation,
): { x: number; y: number; width: number; height: number } {
  const paper = paperDimensionsMm(paperSize, orientation);
  const m = TITLE_BLOCK_PAPER_MARGIN_MM; // 10 mm
  return {
    x: m,
    y: m,
    width: paper.width - 2 * m,
    height: paper.height - 2 * m,
  };
}

/**
 * Fetch the bundled Roboto-Cyrillic TTF, base64-encode it, and
 * register it with jsPDF's VFS so Mongolian glyphs render natively
 * (no transliteration, no mojibake). Idempotent — calling twice is
 * harmless beyond the wasted fetch.
 */
export async function loadFontIntoPdf(pdf: jsPDF, fontUrl: string = robotoCyrillicUrl): Promise<void> {
  const response = await fetch(fontUrl);
  if (!response.ok) {
    throw new Error(`Шрифт ачаалж чадсангүй (HTTP ${response.status})`);
  }
  const buf = await response.arrayBuffer();
  const bytes = new Uint8Array(buf);
  // Convert ArrayBuffer → binary string → base64. For files in the
  // ~100 KB range this is fast enough; no chunking needed.
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i += 1) {
    binary += String.fromCharCode(bytes[i]!);
  }
  const base64 = typeof btoa === "function" ? btoa(binary) : "";
  pdf.addFileToVFS("Roboto-Cyrillic.ttf", base64);
  pdf.addFont("Roboto-Cyrillic.ttf", PDF_FONT_NAME, "normal");
  pdf.setFont(PDF_FONT_NAME);
}

/* ─── Layout: title block / scale bar / north arrow ─────────────── */

/**
 * Render the title block directly with jsPDF text + line primitives
 * (vector output, full Cyrillic support via the embedded font).
 *
 * Positioned at the paper's bottom-right corner with a 10 mm margin
 * — mirroring the on-canvas preview anchor from Phase 6.7.2.
 */
function renderTitleBlock(
  pdf: jsPDF,
  settings: ProjectSettings,
  scale: StandardScale,
  paperSize: PaperSize,
  orientation: PaperOrientation,
): void {
  const paper = paperDimensionsMm(paperSize, orientation);
  const tb = titleBlockDimensionsMm(paperSize, orientation);
  const m = TITLE_BLOCK_PAPER_MARGIN_MM;
  const x0 = paper.width - tb.width - m;
  const y0 = paper.height - tb.height - m;
  const rows = titleBlockRows(settings.titleBlock, scale);
  const defaulted = applyTitleBlockDefaults(settings.titleBlock);

  // Outer frame.
  pdf.setDrawColor(34, 34, 34); // #222
  pdf.setFillColor(255, 255, 255);
  pdf.setLineWidth(0.4);
  pdf.rect(x0, y0, tb.width, tb.height, "FD");

  const labelColW = 28;
  const rowH = (tb.height - 4) / rows.length;
  const padX = 2;

  pdf.setFontSize(7);
  pdf.setTextColor(85); // labels
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i]!;
    const ry = y0 + 2 + i * rowH;
    // Horizontal separator
    if (i > 0) {
      pdf.setDrawColor(136, 136, 136); // #888
      pdf.setLineWidth(0.15);
      pdf.line(x0, ry, x0 + tb.width, ry);
    }
    // Label cell
    pdf.setTextColor(85, 85, 85);
    pdf.text(row.label, x0 + padX, ry + 3);
    // Vertical separator
    pdf.line(x0 + labelColW, ry, x0 + labelColW, ry + rowH);
    // Value cell — emphasise drawing title
    if (row.label === "Зургийн нэр") {
      pdf.setFontSize(9);
      pdf.setTextColor(34, 34, 34);
      pdf.text(row.value, x0 + labelColW + padX, ry + 4);
      pdf.setFontSize(7);
    } else {
      pdf.setTextColor(34, 34, 34);
      pdf.setFontSize(8);
      pdf.text(row.value, x0 + labelColW + padX, ry + 3.5);
      pdf.setFontSize(7);
    }
    // Signature dashed line (for Зурсан / Шалгасан / Бат. зөвш.)
    if (row.signature) {
      const sy = ry + rowH - 1.2;
      pdf.setDrawColor(136, 136, 136);
      pdf.setLineWidth(0.15);
      pdf.setLineDashPattern([0.6, 0.4], 0);
      pdf.line(x0 + labelColW + padX, sy, x0 + tb.width - padX, sy);
      pdf.setLineDashPattern([], 0);
    }
  }
  // Reset to defaults for any follow-up rendering.
  pdf.setTextColor(0, 0, 0);
  pdf.setFontSize(10);
  void defaulted; // values already exercised via rows[].
}

/**
 * Render the scale bar at the paper's bottom-left corner with a
 * 12 mm margin. Tick step matches the canvas preview thanks to
 * `scaleBarSegments` in the math module.
 */
function renderScaleBar(
  pdf: jsPDF,
  scale: StandardScale,
  paperSize: PaperSize,
  orientation: PaperOrientation,
): void {
  const paper = paperDimensionsMm(paperSize, orientation);
  const segments = scaleBarSegments(scale, paper.width);
  const totalM = segments[segments.length - 1]!.metreValue;
  const totalMm = (totalM / metresPerCentimetre(scale)) * 10;
  const x0 = 12;
  const y0 = paper.height - 16;
  // Label
  pdf.setTextColor(34, 34, 34);
  pdf.setFontSize(7);
  pdf.text(`М ${scale}`, x0, y0 - 2);
  // Main bar
  pdf.setDrawColor(34, 34, 34);
  pdf.setLineWidth(0.5);
  pdf.line(x0, y0, x0 + totalMm, y0);
  for (const seg of segments) {
    const tx = x0 + seg.lengthOnPaper_mm;
    pdf.line(tx, y0, tx, y0 - 1.5);
    pdf.setFontSize(6.5);
    pdf.text(`${seg.metreValue}м`, tx, y0 + 3, { align: "center" });
  }
  pdf.setFontSize(10);
}

/**
 * Render the north arrow at the paper's top-right corner with the
 * engineer-configured rotation. Position mirrors the canvas default
 * (top-right with a 12 mm paper margin).
 */
function renderNorthArrow(
  pdf: jsPDF,
  settings: ProjectSettings,
  paperSize: PaperSize,
  orientation: PaperOrientation,
): void {
  const paper = paperDimensionsMm(paperSize, orientation);
  const widthMm = NORTH_ARROW_VISUAL_MM * NORTH_ARROW_ASPECT;
  const heightMm = NORTH_ARROW_VISUAL_MM;
  const rotation = settings.northArrow?.rotation_deg ?? 0;
  const x0 = paper.width - widthMm - NORTH_ARROW_CORNER_PADDING_PX / 4; // ~5 mm margin
  const y0 = NORTH_ARROW_CORNER_PADDING_PX / 4;
  const cx = x0 + widthMm / 2;
  const cy = y0 + heightMm / 2;
  // jsPDF rotation: apply once, draw, restore.
  // We compute the two triangle vertex sets pre-rotated using a
  // simple rotation matrix.
  const theta = (rotation * Math.PI) / 180;
  const cosT = Math.cos(theta);
  const sinT = Math.sin(theta);
  const rotate = (p: { x: number; y: number }) => ({
    x: cx + (p.x - cx) * cosT - (p.y - cy) * sinT,
    y: cy + (p.x - cx) * sinT + (p.y - cy) * cosT,
  });
  const letterArea = heightMm * 0.28;
  const apex = rotate({ x: cx, y: y0 + letterArea });
  const baseLeft = rotate({ x: x0 + widthMm * 0.18, y: y0 + heightMm });
  const baseRight = rotate({ x: x0 + widthMm * 0.82, y: y0 + heightMm });
  const baseMid = rotate({ x: cx, y: y0 + heightMm * 0.78 });

  // Filled triangle (left half)
  pdf.setFillColor(34, 34, 34);
  pdf.setDrawColor(34, 34, 34);
  pdf.setLineWidth(0.3);
  pdf.triangle(apex.x, apex.y, baseLeft.x, baseLeft.y, baseMid.x, baseMid.y, "FD");
  // Outline triangle (right half)
  pdf.setFillColor(255, 255, 255);
  pdf.triangle(apex.x, apex.y, baseRight.x, baseRight.y, baseMid.x, baseMid.y, "FD");
  // "Н" letter at top (rotates with the arrow)
  const letterPos = rotate({ x: cx, y: y0 + letterArea * 0.85 });
  pdf.setTextColor(34, 34, 34);
  pdf.setFontSize(7);
  // jsPDF angle is in degrees, COUNTER-clockwise — we negate to
  // match drafting clockwise convention used in NorthArrow.tsx.
  pdf.text("Н", letterPos.x, letterPos.y, {
    angle: -rotation,
    align: "center",
  });
  pdf.setFontSize(10);
}

/* ─── Main entry ────────────────────────────────────────────────── */

/**
 * Produce a PDF Blob from the current scheme state + settings.
 *
 * @throws Error when `svgElement` is null (caller should ensure the
 *         SVG ref has resolved before invoking). Also when the font
 *         load fails (network / asset URL issue).
 */
export async function exportToPdf(inputs: PdfExportInputs): Promise<Blob> {
  const { state, settings, paperSize, orientation, scale, svgElement } = inputs;
  if (!svgElement) {
    throw new Error("SVG element байхгүй — зургийн canvas ачаалагдаагүй байж магадгүй");
  }

  // 1. Init jsPDF with paper choice
  const pdf = new jsPDF({
    orientation,
    unit: "mm",
    format: paperSize.toLowerCase() as "a3" | "a4",
  });

  // 2. Embed the Cyrillic font so Mongolian text renders correctly
  await loadFontIntoPdf(pdf);

  // 3. Clone + strip non-print elements from the live SVG
  const clone = svgElement.cloneNode(true) as SVGSVGElement;
  const hidden = collectPrintHiddenIds(state, settings);
  stripNonPrintElements(clone, hidden);

  // 4. Normalise the clone for svg2pdf — set explicit width/height
  // attributes (svg2pdf uses these as the user-units) and a viewBox
  // tight to the content where possible. We use the existing
  // getBoundingClientRect via a temporary append to the DOM body
  // ONLY when the live element doesn't already have explicit sizing.
  const r = svgElement.getBoundingClientRect();
  const liveW = Math.max(1, r.width || 1000);
  const liveH = Math.max(1, r.height || 700);
  clone.setAttribute("width", String(liveW));
  clone.setAttribute("height", String(liveH));
  if (!clone.getAttribute("viewBox")) {
    clone.setAttribute("viewBox", `0 0 ${liveW} ${liveH}`);
  }

  // 5. Render into the drawing area
  const area = drawingAreaMm(paperSize, orientation);
  await pdf.svg(clone, {
    x: area.x,
    y: area.y,
    width: area.width,
    height: area.height,
  });

  // 6. Overlay title block + scale bar + north arrow at paper mm
  pdf.setFont(PDF_FONT_NAME);
  renderTitleBlock(pdf, settings, scale, paperSize, orientation);
  renderScaleBar(pdf, scale, paperSize, orientation);
  renderNorthArrow(pdf, settings, paperSize, orientation);

  return pdf.output("blob");
}

/* ─── Re-exports for tests + UI integration ─────────────────────── */
export type { LayerKey };
export { resolveLayer, resolveLayerByKey, layerKeyFor };
