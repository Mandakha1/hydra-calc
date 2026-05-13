/**
 * Phase 6.7.2 — Title-block helpers (pure functions).
 *
 * Defaults + row layout + paper-aware dimensions for the
 * "Зургийн тамга" stamp. The React render component lives in
 * `./TitleBlock.tsx`; the PDF exporter (6.7.4) will reuse the same
 * helpers so the on-canvas preview and the printed page stay in
 * lock-step.
 *
 * Sizing convention (matches Mongolian / СП 41-101 drafting practice):
 *   A3 landscape  → title block 185 × 70 mm
 *   A3 portrait   → 180 × 70 mm
 *   A4 landscape  → 165 × 55 mm
 *   A4 portrait   → 165 × 55 mm
 * Block stays in the bottom-right corner with a 10 mm paper margin.
 */

import type { TitleBlockMeta } from "../hydraulicTypes";
import type { PaperSize, PaperOrientation, StandardScale } from "./scales";

/** Default drawing title — Mongolian convention for a primary
 *  heating-network plan view. */
export const DEFAULT_DRAWING_TITLE = "Дулааны магистрал шугам — план";
/** Default standards footer string. Engineer can edit / append. */
export const DEFAULT_STANDARDS_FOOTER =
  "БНбД 41-01-2019 / СП 124.13330.2012";
/** Default revision number for a fresh project. */
export const DEFAULT_REVISION = "0";
/** Default sheet number. Engineer types "2/3" etc. for multi-sheet
 *  projects. */
export const DEFAULT_SHEET_NUMBER = "1/1";

/** Today's date in ISO YYYY-MM-DD format. Exported so the
 *  SettingsPanel "Өнөөдөр" button can populate the field consistently. */
export function todayIsoDate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** A defaulted view of TitleBlockMeta — every field guaranteed
 *  non-undefined. Renderer calls this before laying out rows. */
export interface DefaultedTitleBlock {
  drawingTitle: string;
  projectCode: string;
  engineer: string;
  checker: string;
  approver: string;
  company: string;
  address: string;
  date: string;
  revision: string;
  sheetNumber: string;
  standardsFooter: string;
}

/** Apply defaults to a partial / undefined TitleBlockMeta. */
export function applyTitleBlockDefaults(
  meta: TitleBlockMeta | undefined,
): DefaultedTitleBlock {
  const m = meta ?? {};
  return {
    drawingTitle: m.drawingTitle ?? DEFAULT_DRAWING_TITLE,
    projectCode: m.projectCode ?? "",
    engineer: m.engineer ?? "",
    checker: m.checker ?? "",
    approver: m.approver ?? "",
    company: m.company ?? "",
    address: m.address ?? "",
    date: m.date && m.date.trim().length > 0 ? m.date : todayIsoDate(),
    revision: m.revision ?? DEFAULT_REVISION,
    sheetNumber: m.sheetNumber ?? DEFAULT_SHEET_NUMBER,
    standardsFooter: m.standardsFooter ?? DEFAULT_STANDARDS_FOOTER,
  };
}

/** Title-block outer dimensions (mm) for the given paper. Engineer
 *  conventions: ~185 mm wide on A3 landscape, snug 165 mm on A4. */
export function titleBlockDimensionsMm(
  paperSize: PaperSize,
  orientation: PaperOrientation,
): { width: number; height: number } {
  if (paperSize === "A3") {
    return orientation === "landscape"
      ? { width: 185, height: 70 }
      : { width: 180, height: 70 };
  }
  // A4
  return { width: 165, height: 55 };
}

/** Margin (mm) from the paper edge to the title block's outer frame. */
export const TITLE_BLOCK_PAPER_MARGIN_MM = 10;

/**
 * One label/value pair for the title-block table render. Used by
 * both the SVG component (Phase 6.7.2) and the PDF exporter (Phase
 * 6.7.4) so the two paths produce the same row order + labels.
 */
export interface TitleBlockRow {
  /** Mongolian-convention label shown in the left cell. */
  label: string;
  /** Engineer-supplied value (or default). May be empty — the row
   *  still renders with a blank value cell so signature boxes stay
   *  in place. */
  value: string;
  /** When true the renderer reserves space below the value for a
   *  hand-signature box. Used for Зурсан / Шалгасан / Бат. зөвш. */
  signature?: boolean;
}

/**
 * Build the ordered row table for rendering.
 *
 * Order follows ГОСТ 21.501 + Mongolian convention:
 *   1. Зургийн нэр
 *   2. Төслийн код
 *   3. Хэмжээ (derived from settings.printScale — passed in)
 *   4. Огноо
 *   5. Зурсан (signature)
 *   6. Шалгасан (signature)
 *   7. Бат. зөвш. (signature)
 *   8. Фирм
 *   9. Хаяг
 *   10. Сэргээлт
 *   11. Хуудас
 *   12. Стандарт (footer row)
 *
 * `scale` is the live setting — the title block always reflects
 * the current scale dropdown, not a stored copy.
 */
export function titleBlockRows(
  meta: TitleBlockMeta | undefined,
  scale: StandardScale,
): TitleBlockRow[] {
  const d = applyTitleBlockDefaults(meta);
  return [
    { label: "Зургийн нэр", value: d.drawingTitle },
    { label: "Төслийн код", value: d.projectCode },
    { label: "Хэмжээ", value: scale },
    { label: "Огноо", value: d.date },
    { label: "Зурсан", value: d.engineer, signature: true },
    { label: "Шалгасан", value: d.checker, signature: true },
    { label: "Бат. зөвш.", value: d.approver, signature: true },
    { label: "Фирм", value: d.company },
    { label: "Хаяг", value: d.address },
    { label: "Сэргээлт", value: d.revision },
    { label: "Хуудас", value: d.sheetNumber },
    { label: "Стандарт", value: d.standardsFooter },
  ];
}
