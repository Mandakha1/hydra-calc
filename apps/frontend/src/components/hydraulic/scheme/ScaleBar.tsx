/**
 * Phase 6.7.1 — ScaleBar SVG widget.
 *
 * Renders a graduated horizontal bar showing metre tick marks +
 * "М 1:500"-style label. Sits at a fixed viewport position
 * (bottom-left of the canvas by default) — caller places it OUTSIDE
 * the pan/zoom transform group so it stays stationary as the
 * engineer pans the scheme.
 *
 * Tick positions use the same scheme-space pixel arithmetic as the
 * rest of the canvas (PX_PER_METER from nodeCatalog.ts, overridable
 * for map-aware density). White halo on text + strokes so the bar
 * stays legible over any layer colour.
 *
 * No store coupling — receives data via props so it remains pure
 * presentational and trivially renderable from the PDF exporter
 * (Phase 6.7.4) too.
 */

import type { StandardScale } from "./scales";
import {
  paperDimensionsMm,
  scaleBarSegments,
  segmentLengthInSchemePx,
} from "./scales";
import type { PaperSize, PaperOrientation } from "./scales";
import { PX_PER_METER } from "../nodeCatalog";

interface Props {
  /** Declared scale (e.g. "1:500"). */
  scale: StandardScale;
  /** Paper size — drives the segment-step heuristic. */
  paperSize: PaperSize;
  /** Paper orientation — drives the segment-step heuristic. */
  orientation: PaperOrientation;
  /** Viewport position (SVG-pixel coords) — origin is the bar's
   *  bottom-left corner so labels can sit below without negative-y
   *  weirdness. Caller supplies these from canvas dimensions. */
  x?: number;
  y?: number;
  /** When the Leaflet map is on, the effective pixels-per-metre
   *  follows the zoom level instead of the scheme constant. Caller
   *  passes mapPxPerMeter then. Defaults to PX_PER_METER (no map). */
  pxPerMeter?: number;
}

const TICK_HEIGHT = 6;
const BAR_THICKNESS = 1.5;
const HALO_WIDTH = 3;

export function ScaleBar({
  scale,
  paperSize,
  orientation,
  x = 16,
  y = 16,
  pxPerMeter = PX_PER_METER,
}: Props) {
  const paperDims = paperDimensionsMm(paperSize, orientation);
  const segments = scaleBarSegments(scale, paperDims.width);
  const totalMetres = segments[segments.length - 1]!.metreValue;
  const barLenPx = segmentLengthInSchemePx(totalMetres, pxPerMeter);
  // Defensive: degenerate case (e.g. scaleBarSegments returns all-zeros
  // because the scale is too coarse). Skip render.
  if (barLenPx < 1 || totalMetres === 0) return null;

  return (
    <g
      data-testid="scale-bar"
      transform={`translate(${x}, ${y})`}
      pointerEvents="none"
    >
      {/* Scale label above the bar */}
      <text
        x={0}
        y={-10}
        fontSize={11}
        fontFamily="var(--font-mono, monospace)"
        fontWeight={600}
        fill="#222"
        stroke="white"
        strokeWidth={HALO_WIDTH}
        paintOrder="stroke"
      >
        М {scale}
      </text>
      {/* Main bar */}
      <line
        x1={0}
        y1={0}
        x2={barLenPx}
        y2={0}
        stroke="#222"
        strokeWidth={BAR_THICKNESS}
      />
      {/* Tick marks + labels */}
      {segments.map((seg) => {
        const tickX = segmentLengthInSchemePx(seg.metreValue, pxPerMeter);
        return (
          <g key={seg.metreValue}>
            <line
              x1={tickX}
              y1={0}
              x2={tickX}
              y2={-TICK_HEIGHT}
              stroke="#222"
              strokeWidth={BAR_THICKNESS}
            />
            <text
              x={tickX}
              y={TICK_HEIGHT + 10}
              fontSize={10}
              fontFamily="var(--font-mono, monospace)"
              fill="#222"
              stroke="white"
              strokeWidth={HALO_WIDTH}
              paintOrder="stroke"
              textAnchor="middle"
            >
              {seg.metreValue}м
            </text>
          </g>
        );
      })}
    </g>
  );
}
