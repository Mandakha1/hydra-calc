/**
 * Phase 6.7.2 — TitleBlock SVG widget.
 *
 * Drafting-style bordered frame rendered at a fixed viewport
 * position (bottom-right by default). Mirrors how the title block
 * will look on the printed page — ГОСТ 21.501 / Mongolian
 * convention with 12 rows + signature boxes for the engineer /
 * checker / approver.
 *
 * Sized in millimetres but scaled to viewport pixels via a single
 * `mmToPx` factor so the same component can be reused inside the
 * PDF exporter (Phase 6.7.4) at true 1:1 scale on the actual paper.
 *
 * No store coupling — props only. Caller supplies the TitleBlockMeta
 * + scale + paper choice + an mm→px scaling factor so the widget
 * stays pure / testable.
 */

import type { CSSProperties } from "react";
import type { TitleBlockMeta } from "../hydraulicTypes";
import type { PaperSize, PaperOrientation, StandardScale } from "./scales";
import {
  titleBlockDimensionsMm,
  titleBlockRows,
} from "./titleBlockMeta";

interface Props {
  meta: TitleBlockMeta | undefined;
  scale: StandardScale;
  paperSize: PaperSize;
  orientation: PaperOrientation;
  /** Viewport position (SVG-pixel coords) of the block's
   *  TOP-LEFT corner. */
  x: number;
  y: number;
  /** Conversion factor from title-block-millimetres to render
   *  pixels. On the canvas preview this is ~2.5 (so the widget
   *  occupies a reasonable corner of the viewport). The PDF
   *  exporter (6.7.4) will call with the true mm-to-pt conversion. */
  mmToPx: number;
}

const FONT_SIZE_LABEL_MM = 2.4;
const FONT_SIZE_VALUE_MM = 2.6;
const FONT_SIZE_TITLE_MM = 3.2;
const SIGNATURE_BOX_H_MM = 4;
const ROW_PAD_X_MM = 2;
const ROW_PAD_Y_MM = 1;

/** CSS for the inline-positioned wrapper. Kept as a const so it
 *  doesn't allocate on every render. */
const groupStyle: CSSProperties = { pointerEvents: "none" };

export function TitleBlock({
  meta,
  scale,
  paperSize,
  orientation,
  x,
  y,
  mmToPx,
}: Props) {
  const dims_mm = titleBlockDimensionsMm(paperSize, orientation);
  const w_px = dims_mm.width * mmToPx;
  const h_px = dims_mm.height * mmToPx;

  const rows = titleBlockRows(meta, scale);
  const labelCol_mm = 28; // left column for "Зургийн нэр" etc.
  const labelCol_px = labelCol_mm * mmToPx;
  const rowH_mm = (dims_mm.height - 4) / rows.length;
  const rowH_px = rowH_mm * mmToPx;

  return (
    <g
      transform={`translate(${x}, ${y})`}
      data-testid="title-block"
      style={groupStyle}
    >
      {/* Outer white fill so the stamp covers any underlying canvas
          elements (engineer wants the title block opaque). */}
      <rect
        x={0}
        y={0}
        width={w_px}
        height={h_px}
        fill="white"
        fillOpacity={0.96}
        stroke="#222"
        strokeWidth={1.2}
      />

      {/* Rows */}
      {rows.map((row, i) => {
        const ry = 2 * mmToPx + i * rowH_px;
        const sigY = ry + rowH_px - SIGNATURE_BOX_H_MM * mmToPx;
        return (
          <g key={row.label} data-testid={`title-block-row-${i}`}>
            {/* horizontal separator */}
            {i > 0 && (
              <line
                x1={0}
                y1={ry}
                x2={w_px}
                y2={ry}
                stroke="#888"
                strokeWidth={0.4}
              />
            )}
            {/* label column */}
            <text
              x={ROW_PAD_X_MM * mmToPx}
              y={ry + (FONT_SIZE_LABEL_MM + ROW_PAD_Y_MM) * mmToPx}
              fontSize={FONT_SIZE_LABEL_MM * mmToPx}
              fontFamily="var(--font-mono, monospace)"
              fill="#555"
            >
              {row.label}
            </text>
            {/* vertical separator */}
            <line
              x1={labelCol_px}
              y1={ry}
              x2={labelCol_px}
              y2={ry + rowH_px}
              stroke="#888"
              strokeWidth={0.4}
            />
            {/* value column */}
            <text
              x={labelCol_px + ROW_PAD_X_MM * mmToPx}
              y={
                ry
                + (row.label === "Зургийн нэр"
                  ? FONT_SIZE_TITLE_MM + ROW_PAD_Y_MM
                  : FONT_SIZE_VALUE_MM + ROW_PAD_Y_MM)
                  * mmToPx
              }
              fontSize={
                (row.label === "Зургийн нэр" ? FONT_SIZE_TITLE_MM : FONT_SIZE_VALUE_MM)
                * mmToPx
              }
              fontFamily="var(--font-mono, monospace)"
              fontWeight={row.label === "Зургийн нэр" ? 600 : 400}
              fill="#222"
            >
              {row.value}
            </text>
            {/* signature box for Зурсан / Шалгасан / Бат. зөвш. */}
            {row.signature && (
              <line
                x1={labelCol_px + ROW_PAD_X_MM * mmToPx}
                y1={sigY}
                x2={w_px - ROW_PAD_X_MM * mmToPx}
                y2={sigY}
                stroke="#888"
                strokeWidth={0.4}
                strokeDasharray={`${1.2 * mmToPx} ${0.8 * mmToPx}`}
              />
            )}
          </g>
        );
      })}
    </g>
  );
}
