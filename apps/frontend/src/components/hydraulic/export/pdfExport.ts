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
import type {
  HydraulicState,
  ProjectSettings,
  CalculationResults,
  TitleBlockMeta,
} from "../hydraulicTypes";
import {
  renderProfilePage,
  renderEnergyPage,
  renderWellPage,
  renderCompensatorPage,
  renderPidPage,
  renderChannelCrossSectionPage,
  type PageArea,
} from "./pdfDetailPages";
import { renderCompliancePage } from "./pdfComplianceReport";
import { runComplianceCheck, type ComplianceReport } from "../calc/compliance/ruleEngine";
import { ALL_RULES } from "../calc/compliance/rules";
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
  const { settings, paperSize, orientation, scale, svgElement } = inputs;
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

  // 3-5. Render the Plan page (shared with the multi-page export).
  const area = drawingAreaMm(paperSize, orientation);
  await renderPlanPage(pdf, inputs, area);

  // 6. Overlay title block + scale bar + north arrow at paper mm
  pdf.setFont(PDF_FONT_NAME);
  renderTitleBlock(pdf, settings, scale, paperSize, orientation);
  renderScaleBar(pdf, scale, paperSize, orientation);
  renderNorthArrow(pdf, settings, paperSize, orientation);

  return pdf.output("blob");
}

/* ─── Phase 8.6 — Multi-page drawing-set export ─────────────────── */

/**
 * Detail-page identifiers in the order they appear in the drawing set.
 * The Plan page is always first and always present; the rest can be
 * toggled by the caller. Defaults to ALL pages when `includePages` is
 * omitted.
 */
export type DrawingSetPage =
  | "plan"
  | "profile"
  | "energy"
  | "well"
  | "compensator"
  | "pid"
  // Phase 12.6b — composite-channel cross-section (Л-4 / Л-7 / Л-9).
  | "channel"
  | "compliance";

export const DEFAULT_DRAWING_SET_PAGES: DrawingSetPage[] = [
  "plan",
  "profile",
  "energy",
  "well",
  "compensator",
  "pid",
  "channel",
  "compliance",
];

/** Engineer-facing label for a drawing-set page. */
export function drawingSetPageLabel(page: DrawingSetPage): string {
  switch (page) {
    case "plan":
      return "План — Магистрал шугам";
    case "profile":
      return "Уртын профиль";
    case "energy":
      return "Дулааны тэнцэл";
    case "well":
      return "Худагны зүсэлт";
    case "compensator":
      return "Компенсатор зүсэлт";
    case "pid":
      return "УДДТ — P&ID";
    case "channel":
      return "Сувгийн хөндлөн огтлол";
    case "compliance":
      return "Стандарт шалгалт";
  }
}

export interface DrawingSetPdfInputs extends PdfExportInputs {
  /**
   * Calculation results for the energy-balance sheet. When undefined
   * the energy page falls back to a "Run Тооцоолох first" advisory.
   */
  results?: CalculationResults;
  /**
   * Current single-target selection. Drives which well / compensator
   * the detail pages render. When null, detail pages fall back to
   * the first well / compensator in the scene.
   */
  selection?: { kind: string; id: string } | null;
  /**
   * Pre-computed compliance report. Phase 9.4 — when omitted, the
   * Drawing Set will run `runComplianceCheck` automatically before
   * rendering the Compliance page. Caller can supply a cached
   * report (e.g. from the Compliance tab) to avoid re-running.
   */
  complianceReport?: ComplianceReport;
  /**
   * Pages to include in the bundle (defaults to all seven). Useful
   * for partial exports (e.g. just "plan + profile" for a quick
   * review). `plan` is always anchored at position 1 if requested.
   */
  includePages?: DrawingSetPage[];
}

/**
 * Build a temporary TitleBlockMeta that overrides the sheet number
 * with the per-page index (e.g. "1/6", "2/6"). The engineer's other
 * fields are passed through untouched.
 */
function withSheetNumber(
  meta: TitleBlockMeta | undefined,
  sheetIdx: number,
  total: number,
): TitleBlockMeta {
  return {
    ...(meta ?? {}),
    sheetNumber: `${sheetIdx}/${total}`,
  };
}

/**
 * Plan-page renderer extracted from `exportToPdf` so the multi-page
 * export can call it inside the page loop. Mutates the existing pdf
 * instance; caller is responsible for `pdf.addPage()` between calls.
 */
async function renderPlanPage(
  pdf: jsPDF,
  inputs: PdfExportInputs,
  area: ReturnType<typeof drawingAreaMm>,
): Promise<void> {
  const { state, settings, svgElement } = inputs;
  if (!svgElement) {
    throw new Error("SVG element байхгүй — зургийн canvas ачаалагдаагүй байж магадгүй");
  }
  const clone = svgElement.cloneNode(true) as SVGSVGElement;
  const hidden = collectPrintHiddenIds(state, settings);
  stripNonPrintElements(clone, hidden);
  const r = svgElement.getBoundingClientRect();
  const liveW = Math.max(1, r.width || 1000);
  const liveH = Math.max(1, r.height || 700);
  clone.setAttribute("width", String(liveW));
  clone.setAttribute("height", String(liveH));
  if (!clone.getAttribute("viewBox")) {
    clone.setAttribute("viewBox", `0 0 ${liveW} ${liveH}`);
  }
  await pdf.svg(clone, {
    x: area.x,
    y: area.y,
    width: area.width,
    height: area.height,
  });
}

/**
 * Export the full A3 drawing set as a multi-page PDF.
 *
 * Page order (default):
 *   1. План — Магистрал шугам      (SVG via svg2pdf)
 *   2. Уртын профиль                (jsPDF primitives, СП 124 §7.4)
 *   3. Дулааны тэнцэл               (jsPDF primitives, БНбД 41-01 §5)
 *   4. Худагны зүсэлт               (jsPDF primitives, ГОСТ 21.605)
 *   5. Компенсатор зүсэлт           (jsPDF primitives, СП 124 §11.3)
 *   6. УДДТ — P&ID                  (jsPDF primitives, ГОСТ 21.404)
 *
 * Every page shares the same paper / orientation / title-block layout
 * — the title block's "Хуудас" field is per-page injected as "N/M".
 * Pages where a scale is meaningful (Plan + Profile + Well +
 * Compensator) include the scale bar; pages where it isn't meaningful
 * (Energy balance + P&ID) omit it.
 */
export async function exportDrawingSetPdf(inputs: DrawingSetPdfInputs): Promise<Blob> {
  const {
    state, settings, paperSize, orientation, scale, svgElement,
    results, selection, complianceReport, includePages,
  } = inputs;

  const pages: DrawingSetPage[] = includePages && includePages.length > 0
    ? [...includePages]
    : [...DEFAULT_DRAWING_SET_PAGES];

  // Plan page needs the live SVG. If not on the Plan tab, drop it
  // gracefully so engineer can still get the detail bundle.
  const finalPages = pages.filter((p) => p !== "plan" || svgElement);

  if (finalPages.length === 0) {
    throw new Error("Drawing set хоосон — оруулах хуудас сонгогдоогүй.");
  }

  const pdf = new jsPDF({
    orientation,
    unit: "mm",
    format: paperSize.toLowerCase() as "a3" | "a4",
  });
  await loadFontIntoPdf(pdf);

  const area = drawingAreaMm(paperSize, orientation);
  const total = finalPages.length;

  for (let i = 0; i < finalPages.length; i += 1) {
    const page = finalPages[i]!;
    if (i > 0) {
      pdf.addPage(paperSize.toLowerCase() as "a3" | "a4", orientation);
    }
    pdf.setFont(PDF_FONT_NAME);

    // Render the page body
    if (page === "plan") {
      await renderPlanPage(pdf, inputs, area);
    } else if (page === "profile") {
      renderProfilePage(pdf, area as PageArea, state);
    } else if (page === "energy") {
      renderEnergyPage(pdf, area as PageArea, state, results);
    } else if (page === "well") {
      renderWellPage(pdf, area as PageArea, state, selection ?? null);
    } else if (page === "compensator") {
      renderCompensatorPage(pdf, area as PageArea, state, selection ?? null);
    } else if (page === "pid") {
      renderPidPage(pdf, area as PageArea, state);
    } else if (page === "channel") {
      renderChannelCrossSectionPage(pdf, area as PageArea, state, selection ?? null);
    } else if (page === "compliance") {
      // Use the supplied compliance report or compute one on the fly.
      const report = complianceReport ?? runComplianceCheck(state, results, ALL_RULES);
      renderCompliancePage(pdf, area as PageArea, report);
    }

    // Overlay title block + (optional) scale bar + (optional) north arrow.
    // Inject per-page sheet number.
    const perPageSettings: ProjectSettings = {
      ...settings,
      titleBlock: withSheetNumber(settings.titleBlock, i + 1, total),
    };
    renderTitleBlock(pdf, perPageSettings, scale, paperSize, orientation);
    // Scale bar only on pages where scale is meaningful. Compliance + Energy + P&ID skip it.
    if (page === "plan" || page === "profile" || page === "well" || page === "compensator") {
      renderScaleBar(pdf, scale, paperSize, orientation);
    }
    if (page === "plan") {
      renderNorthArrow(pdf, perPageSettings, paperSize, orientation);
    }
  }

  return pdf.output("blob");
}

/* ─── Re-exports for tests + UI integration ─────────────────────── */
export type { LayerKey };
export { resolveLayer, resolveLayerByKey, layerKeyFor };
