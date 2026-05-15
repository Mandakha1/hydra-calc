/**
 * Phase 11.2 — Multi-page Plan tiling.
 *
 * Networks larger than the chosen paper size at the chosen scale get
 * split across multiple pages. Default policy: auto-tile when the
 * project bbox at scale exceeds the drawing area.
 *
 * Pure math; no DOM / jsPDF. Renderer in pdfExport.ts consumes the
 * tile grid and produces one Plan page per tile.
 *
 * Tile layout convention:
 *   - Tile (0,0) is the bottom-left of the project bbox (BIM
 *     drafting convention, Y-up)
 *   - Tile index is "(row+1) of (rows×cols)" — engineer reads it
 *     as "Plan tile 1/4", "2/4", ... on the sheet number
 *   - When a single tile is enough (project fits), no tiling
 *     happens and the legacy single-Plan flow is used
 */
import type { PaperSize, PaperOrientation, StandardScale } from "../scheme/scales";
import { paperDimensionsMm, metresPerCentimetre } from "../scheme/scales";

/** Drawing-area margin in mm — kept in sync with drawingAreaMm. */
const PAPER_MARGIN_MM = 10;

export interface TileBounds {
  /** 0-based tile index along X (column). */
  col: number;
  /** 0-based tile index along Y (row). Y-up; row 0 is the BOTTOM. */
  row: number;
  /** Tile bounds in scheme-pixel coords (NOT mm). The renderer uses
   *  this as the SVG's per-tile viewBox so each page shows only the
   *  tile's portion of the network. */
  viewBoxPx: {
    minX: number;
    minY: number;
    width: number;
    height: number;
  };
  /** Engineer-facing sheet label, e.g. "Plan 1/4". */
  label: string;
}

export interface TileGrid {
  /** Total tiles across (rows × cols). When 1, no tiling needed. */
  totalTiles: number;
  cols: number;
  rows: number;
  tiles: TileBounds[];
}

/**
 * Compute the per-paper drawing area in scheme-pixel coords. This is
 * what fits onto ONE printed page at the chosen scale.
 *
 * Math:
 *   1. Paper drawing-area dimensions in mm
 *   2. mm → m: drawing area in metres at the scale
 *   3. m → scheme px: × PX_PER_METER
 */
export function pageBoundsInPx(
  paperSize: PaperSize,
  orientation: PaperOrientation,
  scale: StandardScale,
  pxPerMeter: number,
): { widthPx: number; heightPx: number } {
  const paper = paperDimensionsMm(paperSize, orientation);
  const drawingW_mm = paper.width - 2 * PAPER_MARGIN_MM;
  const drawingH_mm = paper.height - 2 * PAPER_MARGIN_MM;
  // mm → m at the given scale
  const metresPerMm = metresPerCentimetre(scale) / 10;
  const drawingW_m = drawingW_mm * metresPerMm;
  const drawingH_m = drawingH_mm * metresPerMm;
  return {
    widthPx: drawingW_m * pxPerMeter,
    heightPx: drawingH_m * pxPerMeter,
  };
}

/**
 * Compute the tile grid for the given project bbox at the given paper
 * + scale. Returns 1×1 (single tile) when the project fits cleanly.
 *
 * @param bboxPx       Scheme-pixel bounding box of the project (from
 *                     the SchemeEditor's SVG viewBox or computed
 *                     from node positions).
 * @param paperSize    A3 / A4
 * @param orientation  landscape / portrait
 * @param scale        "1:500" etc.
 * @param pxPerMeter   PX_PER_METER from nodeCatalog (20 by default)
 * @param maxCols      Cap to prevent runaway tile counts on absurd
 *                     fixtures (default 4, matching the spec's 2×2
 *                     example — engineers don't need more in practice
 *                     and a 4×4 = 16-page Plan is unreadable anyway).
 */
export function computeTileGrid(
  bboxPx: { minX: number; minY: number; width: number; height: number },
  paperSize: PaperSize,
  orientation: PaperOrientation,
  scale: StandardScale,
  pxPerMeter: number,
  maxCols: number = 4,
): TileGrid {
  const page = pageBoundsInPx(paperSize, orientation, scale, pxPerMeter);
  const colsRaw = Math.ceil(bboxPx.width / page.widthPx);
  const rowsRaw = Math.ceil(bboxPx.height / page.heightPx);
  // Clamp to maxCols for sanity (large fixtures at fine scale can
  // theoretically tile to 100s of pages — clamp prevents accidental
  // gigabyte PDFs).
  const cols = Math.max(1, Math.min(colsRaw, maxCols));
  const rows = Math.max(1, Math.min(rowsRaw, maxCols));

  // No tiling needed when single tile suffices.
  if (cols === 1 && rows === 1) {
    return {
      totalTiles: 1,
      cols: 1,
      rows: 1,
      tiles: [{
        col: 0,
        row: 0,
        viewBoxPx: { ...bboxPx },
        label: "Plan 1/1",
      }],
    };
  }

  const tiles: TileBounds[] = [];
  const tileWidthPx = bboxPx.width / cols;
  const tileHeightPx = bboxPx.height / rows;
  // Order: top-to-bottom, left-to-right (drafting convention — sheet
  // 1 is top-left, sheet 2 is top-middle, etc.).
  let sheetIdx = 0;
  for (let r = rows - 1; r >= 0; r -= 1) {
    for (let c = 0; c < cols; c += 1) {
      sheetIdx += 1;
      tiles.push({
        col: c,
        row: r,
        viewBoxPx: {
          minX: bboxPx.minX + c * tileWidthPx,
          // Y-down in SVG (scheme coords) — invert row index
          minY: bboxPx.minY + (rows - 1 - r) * tileHeightPx,
          width: tileWidthPx,
          height: tileHeightPx,
        },
        label: `Plan ${sheetIdx}/${cols * rows}`,
      });
    }
  }
  return {
    totalTiles: cols * rows,
    cols,
    rows,
    tiles,
  };
}

/**
 * Estimate whether a project would benefit from tiling at the current
 * scale. Returns the tile count (1 means "fits on one page").
 * Used by the settings UI to surface a hint to the engineer.
 */
export function suggestedTileCount(
  bboxPx: { width: number; height: number },
  paperSize: PaperSize,
  orientation: PaperOrientation,
  scale: StandardScale,
  pxPerMeter: number,
): number {
  const page = pageBoundsInPx(paperSize, orientation, scale, pxPerMeter);
  const cols = Math.ceil(bboxPx.width / page.widthPx);
  const rows = Math.ceil(bboxPx.height / page.heightPx);
  return Math.max(1, cols * rows);
}
