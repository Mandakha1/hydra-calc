/**
 * Phase 12.6 — Composite channel cross-section detail view.
 *
 * Renders the engineer-facing ГК-23/02 cross-section sheet for the
 * selected channel (or the first channel when none selected):
 *
 *   - Concrete channel rectangle to scale (mm-precise).
 *   - Contained pipes laid out left-to-right in canonical
 *     CIRCUIT_DEFAULTS order (D2.1 / D2.2 / D3 / D4 / У1).
 *   - Each pipe rendered as a colour-coded circle proportional to DN.
 *   - Engineer-facing per-pipe table with code + DN + material + temp.
 *
 * Standard reference: ГК-23/02 СЕРИЯ Г-991-1.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useHydraulicStore } from "../hydraulicStore";
import {
  buildChannelDetail,
  tempBadge,
  type ChannelCrossSection,
  type ChannelCrossSectionError,
  type ChannelCrossSectionPipe,
} from "../scheme/channelCrossSection";

const PALETTE = {
  concreteFill: "rgba(120, 120, 120, 0.12)",
  concreteStroke: "var(--fg)",
  sleeper: "rgba(80, 80, 80, 0.35)",
  pipeOutline: "#1a1a1a",
  axis: "var(--fg-muted)",
  dim: "var(--fg-muted)",
};

export function ChannelDetail() {
  const channels = useHydraulicStore((s) => s.channels);
  const pipes = useHydraulicStore((s) => s.pipes);
  const selection = useHydraulicStore((s) => s.selection);

  const view = useMemo<ChannelCrossSection | ChannelCrossSectionError>(
    () => buildChannelDetail(channels, pipes, selection),
    [channels, pipes, selection],
  );

  // ResizeObserver for responsive scale.
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const ro = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) setWidth(Math.max(420, rect.width - 24));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={containerRef} style={containerStyle} data-testid="channel-detail">
      <header style={{ marginBottom: 12 }}>
        <h3 style={{ margin: 0 }}>▤ Суваг — хөндлөн огтлол</h3>
        <p style={{ margin: "0.25rem 0", fontSize: 13, color: "var(--fg-muted)" }}>
          ГК-23/02 СЕРИЯ Г-991-1: бетон сувагт байрласан хоолойнуудын ёс
          журамт байршил (D2.1 / D2.2 / D3 / D4 / У1).
        </p>
      </header>

      {"error" in view ? (
        <div style={errorBanner} data-testid="channel-error">{view.error}</div>
      ) : (
        <>
          <ChannelHeader detail={view} />
          <CrossSectionSvg detail={view} width={width} />
          <PipeTable pipes={view.pipes} />
        </>
      )}
    </div>
  );
}

/* ─── Header strip ─────────────────────────────────────────────── */

function ChannelHeader({ detail }: { detail: ChannelCrossSection }) {
  return (
    <div style={summaryGrid} data-testid="channel-header">
      <Stat label="Төрөл" value={detail.typeLabel} />
      <Stat label="Хэмжээ" value={`${detail.width_mm} × ${detail.height_mm} мм`} />
      <Stat label="Хоолой" value={`${detail.pipeCount} ш`} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={statCell}>
      <div style={{ fontSize: 11, color: "var(--fg-muted)" }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 600 }}>{value}</div>
    </div>
  );
}

/* ─── Cross-section SVG ───────────────────────────────────────── */

function CrossSectionSvg({
  detail,
  width,
}: {
  detail: ChannelCrossSection;
  width: number;
}) {
  // Fit-to-width: 70 px padding on each side for dimension annotations.
  const padPx = 70;
  const usableWidthPx = Math.max(200, width - 2 * padPx);
  const pxPerMm = detail.width_mm > 0 ? usableWidthPx / detail.width_mm : 0.2;
  const drawW = detail.width_mm * pxPerMm;
  const drawH = detail.height_mm * pxPerMm;
  const totalW = drawW + 2 * padPx;
  const totalH = drawH + 100; // room for top + bottom dimensions

  // SVG Y is down; we computed pipes with Y-up from floor → convert
  // when placing centre and label.
  const channelTopY = 40;
  const channelBottomY = channelTopY + drawH;

  return (
    <div style={canvasWrap} data-testid="channel-canvas">
      <svg
        viewBox={`0 0 ${totalW} ${totalH}`}
        style={{ width: "100%", height: "auto", maxHeight: 360 }}
      >
        {/* Width dimension above channel */}
        <g stroke={PALETTE.dim} fill={PALETTE.dim} strokeWidth={1}>
          <line x1={padPx} y1={20} x2={padPx + drawW} y2={20} />
          <line x1={padPx} y1={16} x2={padPx} y2={24} />
          <line x1={padPx + drawW} y1={16} x2={padPx + drawW} y2={24} />
          <text
            x={padPx + drawW / 2}
            y={14}
            textAnchor="middle"
            fontSize={11}
            stroke="none"
          >
            {detail.width_mm} мм
          </text>
        </g>

        {/* Height dimension on the right */}
        <g stroke={PALETTE.dim} fill={PALETTE.dim} strokeWidth={1}>
          <line
            x1={padPx + drawW + 20}
            y1={channelTopY}
            x2={padPx + drawW + 20}
            y2={channelBottomY}
          />
          <line
            x1={padPx + drawW + 16}
            y1={channelTopY}
            x2={padPx + drawW + 24}
            y2={channelTopY}
          />
          <line
            x1={padPx + drawW + 16}
            y1={channelBottomY}
            x2={padPx + drawW + 24}
            y2={channelBottomY}
          />
          <text
            x={padPx + drawW + 30}
            y={channelTopY + drawH / 2}
            fontSize={11}
            stroke="none"
            dominantBaseline="middle"
          >
            {detail.height_mm} мм
          </text>
        </g>

        {/* Concrete channel rectangle */}
        <rect
          x={padPx}
          y={channelTopY}
          width={drawW}
          height={drawH}
          fill={PALETTE.concreteFill}
          stroke={PALETTE.concreteStroke}
          strokeWidth={1.5}
        />

        {/* Concrete sleeper strip at the bottom (engineer cue:
            pipes rest on this, not directly on the floor). */}
        <rect
          x={padPx}
          y={channelBottomY - 6}
          width={drawW}
          height={6}
          fill={PALETTE.sleeper}
          stroke="none"
        />

        {/* Contained pipes */}
        {detail.pipes.map((p) => {
          const cx = padPx + p.centerX_mm * pxPerMm;
          // Convert pipe Y (from floor, up) into SVG Y (top, down)
          const cy = channelBottomY - p.centerY_mm * pxPerMm;
          const r = Math.max(4, p.radius_mm * pxPerMm);
          return (
            <g key={p.pipeId} data-testid={`channel-pipe-${p.pipeId}`}>
              <circle
                cx={cx}
                cy={cy}
                r={r}
                fill={p.fill}
                stroke={PALETTE.pipeOutline}
                strokeWidth={1}
              />
              {/* Label inside circle (when room) */}
              <text
                x={cx}
                y={cy + 3}
                textAnchor="middle"
                fontSize={Math.min(11, r * 0.9)}
                fill="white"
                fontWeight={600}
              >
                {p.code}
              </text>
              {/* DN badge below */}
              <text
                x={cx}
                y={channelBottomY + 14}
                textAnchor="middle"
                fontSize={10}
                fill="var(--fg)"
              >
                Φ{p.dn_mm}
              </text>
              {/* Temperature badge above (when defined) */}
              {p.tempC != null && (
                <text
                  x={cx}
                  y={cy - r - 4}
                  textAnchor="middle"
                  fontSize={10}
                  fill={p.fill}
                  fontWeight={600}
                >
                  {p.tempC}°C
                </text>
              )}
            </g>
          );
        })}

        {/* Channel-type label below the bottom dimensions */}
        <text
          x={padPx + drawW / 2}
          y={channelBottomY + 38}
          textAnchor="middle"
          fontSize={12}
          fontWeight={600}
          fill="var(--fg)"
        >
          {detail.typeLabel}
        </text>
      </svg>
    </div>
  );
}

/* ─── Pipe table ─────────────────────────────────────────────── */

function PipeTable({ pipes }: { pipes: ChannelCrossSectionPipe[] }) {
  if (pipes.length === 0) {
    return (
      <div style={errorBanner} data-testid="channel-empty-pipes">
        Энэ сувагт хоолой алга. Хоолой нэмэхэд хадгалагдсан channel-руу багтаана.
      </div>
    );
  }
  return (
    <table style={tableStyle} data-testid="channel-pipe-table">
      <thead>
        <tr>
          <th style={thStyle}>#</th>
          <th style={thStyle}>Код</th>
          <th style={thStyle}>Хэлхээ</th>
          <th style={thStyle}>Φ (DN)</th>
          <th style={thStyle}>Материал</th>
          <th style={thStyle}>Темп.</th>
        </tr>
      </thead>
      <tbody>
        {pipes.map((p, i) => (
          <tr key={p.pipeId} data-testid={`channel-pipe-row-${p.pipeId}`}>
            <td style={tdStyle}>{i + 1}</td>
            <td style={{ ...tdStyle, color: p.fill, fontWeight: 600 }}>{p.code}</td>
            <td style={tdStyle}>{p.label}</td>
            <td style={tdStyle}>Φ{p.dn_mm}</td>
            <td style={tdStyle}>{p.materialKey}</td>
            <td style={tdStyle}>{tempBadge(p.tempC) ?? "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* ─── Styles ────────────────────────────────────────────────── */

const containerStyle: CSSProperties = {
  padding: "1rem 1.25rem",
  maxWidth: 1100,
  margin: "0 auto",
  color: "var(--fg)",
};
const summaryGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
  gap: 8,
  marginBottom: 12,
};
const statCell: CSSProperties = {
  padding: "8px 12px",
  background: "var(--bg-soft, rgba(0,0,0,0.04))",
  borderRadius: 6,
};
const canvasWrap: CSSProperties = {
  border: "1px solid var(--border-soft)",
  borderRadius: 6,
  padding: 12,
  background: "var(--bg-elevated, white)",
  marginBottom: 12,
};
const tableStyle: CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 13,
};
const thStyle: CSSProperties = {
  padding: "6px 8px",
  textAlign: "left",
  borderBottom: "2px solid var(--border-soft)",
  background: "var(--bg-soft, rgba(0,0,0,0.04))",
};
const tdStyle: CSSProperties = {
  padding: "6px 8px",
  borderBottom: "1px solid var(--border-soft)",
};
const errorBanner: CSSProperties = {
  padding: "12px 14px",
  background: "var(--bg-soft, rgba(220, 220, 220, 0.4))",
  borderRadius: 6,
  color: "var(--fg-muted)",
  fontSize: 13,
  lineHeight: 1.5,
};
