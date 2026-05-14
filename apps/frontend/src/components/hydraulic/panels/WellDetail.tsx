/**
 * Phase 8.3 — Well / chamber cross-section detail view.
 *
 * Renders an engineer-grade cross-section of the engineer-selected
 * ҮХТ chamber: ground line, chamber rectangle to scale, manhole
 * cover on top, pipe penetrations on each side. Inline edits for
 * chamber dimensions live next to the drawing per the Phase 8
 * architectural-decision verdict (inline-edit on 8.3/8.4).
 *
 * Standards:
 *   - ГОСТ 21.605       (chamber cross-section drawing format)
 *   - БНбД 41-01-2019 §6.2 (chamber siting + cover dimensions)
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useHydraulicStore } from "../hydraulicStore";
import {
  buildWellDetail,
  DEFAULT_WELL_DIMS,
  sideLabel,
  type WellDetail,
  type WellDetailError,
} from "../scheme/wellDetail";

const PALETTE = {
  ground: "#BA7517",
  chamberFill: "rgba(186, 117, 23, 0.05)",
  chamberStroke: "var(--fg)",
  cover: "#5F5E5A",
  pipeSupply: "#A32D2D",
  pipeReturn: "#1F5FAA",
  pipeOther: "#888",
  axis: "var(--fg-muted)",
  dim: "var(--fg-muted)",
};

const CIRCUIT_COLOR: Record<string, string> = {
  heating_supply: PALETTE.pipeSupply,
  heating_return: PALETTE.pipeReturn,
  dhw_supply: "#E6914F",
  dhw_return: "#9C4F94",
  cold_water: "#378ADD",
};

export function WellDetail() {
  const nodes = useHydraulicStore((s) => s.nodes);
  const pipes = useHydraulicStore((s) => s.pipes);
  const selection = useHydraulicStore((s) => s.selection);
  const updateNode = useHydraulicStore((s) => s.updateNode);

  const view = useMemo<WellDetail | WellDetailError>(
    () => buildWellDetail(nodes, pipes, selection),
    [nodes, pipes, selection],
  );

  // ResizeObserver — same pattern as Phase 8.1 / 8.2.
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
    <div ref={containerRef} style={containerStyle} data-testid="well-detail">
      <header style={{ marginBottom: 12 }}>
        <h3 style={{ margin: 0 }}>🛢 Худагны зураг (cross-section)</h3>
        <p style={{ margin: "0.25rem 0", fontSize: 13, color: "var(--fg-muted)" }}>
          Камер / худагны хөндлөн огтлол. ГОСТ 21.605 + БНбД 41-01 §6.2-н
          дагуу хэмжээ + хучилт зурагт.
        </p>
      </header>

      {"error" in view ? (
        <div style={errorBanner} data-testid="well-error">{view.error}</div>
      ) : (
        <>
          <WellHeader detail={view} />
          <DimensionsForm detail={view} updateNode={updateNode} />
          <CrossSection detail={view} width={width} />
          <PenetrationsTable detail={view} />
        </>
      )}
    </div>
  );
}

/* ─── Header strip ─────────────────────────────────────────────── */

function WellHeader({ detail }: { detail: WellDetail }) {
  return (
    <div style={summaryGrid} data-testid="well-header">
      <Stat label="Худаг" value={detail.label} />
      <Stat label="Төрөл" value={detail.kind} />
      <Stat
        label="Хэмжээ"
        value={`${detail.length_m} × ${detail.width_m} × ${detail.depth_m} м`}
      />
      <Stat label="Хучилт Ø" value={`${detail.coverDiameter_mm} мм`} />
      <Stat label="Хоолой" value={`${detail.penetrations.length}`} />
      {!detail.hasExplicitDimensions && (
        <div style={advisoryStyle} data-testid="well-default-advisory">
          ⚠ Хэмжээ оруулаагүй учир default утгууд ашиглагдсан
          ({DEFAULT_WELL_DIMS.length_m} × {DEFAULT_WELL_DIMS.width_m} ×{" "}
          {DEFAULT_WELL_DIMS.depth_m} м, Ø{DEFAULT_WELL_DIMS.coverDiameter_mm} мм).
          Доорх талбараас бодит хэмжээг оруулна уу.
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={statBoxStyle}>
      <span style={{ fontSize: 11, color: "var(--fg-muted)" }}>{label}</span>
      <span style={{ fontSize: 13, fontFamily: "var(--font-mono)", fontWeight: 600 }}>{value}</span>
    </div>
  );
}

/* ─── Inline-edit dimensions form (Phase 8 arch decision #1) ──── */

function DimensionsForm({
  detail,
  updateNode,
}: {
  detail: WellDetail;
  updateNode: (id: string, patch: Partial<{ chamber_length_m: number; chamber_width_m: number; chamber_depth_m: number; coverDiameter_mm: number }>) => void;
}) {
  return (
    <div style={dimsForm} data-testid="well-dimensions-form">
      <NumField
        label="Урт L (м)"
        value={detail.length_m}
        onChange={(v) => updateNode(detail.nodeId, { chamber_length_m: v })}
        step={0.1}
        min={0.5}
        max={20}
      />
      <NumField
        label="Өргөн W (м)"
        value={detail.width_m}
        onChange={(v) => updateNode(detail.nodeId, { chamber_width_m: v })}
        step={0.1}
        min={0.5}
        max={15}
      />
      <NumField
        label="Гүн H (м)"
        value={detail.depth_m}
        onChange={(v) => updateNode(detail.nodeId, { chamber_depth_m: v })}
        step={0.1}
        min={0.5}
        max={10}
      />
      <NumField
        label="Хучилт Ø (мм)"
        value={detail.coverDiameter_mm}
        onChange={(v) => updateNode(detail.nodeId, { coverDiameter_mm: v })}
        step={50}
        min={400}
        max={1200}
      />
    </div>
  );
}

function NumField({
  label,
  value,
  onChange,
  step,
  min,
  max,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step: number;
  min: number;
  max: number;
}) {
  return (
    <label style={fieldStyle}>
      <span style={{ fontSize: 11, color: "var(--fg-muted)" }}>{label}</span>
      <input
        type="number"
        value={value}
        step={step}
        min={min}
        max={max}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (!Number.isNaN(v) && v >= min && v <= max) onChange(v);
        }}
        style={inputStyle}
      />
    </label>
  );
}

/* ─── Cross-section SVG ────────────────────────────────────────── */

function CrossSection({ detail, width }: { detail: WellDetail; width: number }) {
  const PAD = 60;
  const drawW = Math.max(200, width - PAD * 2);
  // Vertical: ground at y=80, chamber depth scaled to leave room
  // for dimension callouts below.
  const groundY = 80;
  const SCALE_PX_PER_M = Math.min(80, drawW / Math.max(detail.length_m, 0.5));
  const chamberW = detail.length_m * SCALE_PX_PER_M;
  const chamberH = detail.depth_m * SCALE_PX_PER_M;
  const chamberX = PAD + (drawW - chamberW) / 2;
  const chamberY = groundY;
  const chamberBottomY = chamberY + chamberH;
  const drawH = chamberBottomY + 100; // room for dim callouts

  // Cover sits on TOP of the chamber, centered along length.
  const coverDia_m = detail.coverDiameter_mm / 1000;
  const coverWpx = coverDia_m * SCALE_PX_PER_M;
  const coverCx = chamberX + chamberW / 2;
  const coverCy = groundY - 4; // sits flush on ground

  // Pipe stub geometry: 30 px length on its side.
  const stubLen = 30;
  // Distribute penetrations along each side so multiple pipes don't
  // overlap. Group by side, then place at evenly-spaced fractions.
  const sides = (["top", "right", "bottom", "left"] as const).map((s) => ({
    side: s,
    pens: detail.penetrations.filter((p) => p.side === s),
  }));

  const stubElements: JSX.Element[] = [];
  for (const group of sides) {
    const n = group.pens.length;
    if (n === 0) continue;
    group.pens.forEach((p, i) => {
      const t = (i + 1) / (n + 1); // 1/(n+1), 2/(n+1), …
      const color = CIRCUIT_COLOR[p.circuit ?? ""] ?? PALETTE.pipeOther;
      // Stub thickness scales with DN (clamped 2-8 px).
      const thick = Math.max(2, Math.min(8, p.dn_mm / 25));
      let x1 = 0, y1 = 0, x2 = 0, y2 = 0;
      switch (group.side) {
        case "left":
          x1 = chamberX - stubLen;
          x2 = chamberX;
          y1 = y2 = chamberY + chamberH * t;
          break;
        case "right":
          x1 = chamberX + chamberW;
          x2 = chamberX + chamberW + stubLen;
          y1 = y2 = chamberY + chamberH * t;
          break;
        case "top":
          x1 = x2 = chamberX + chamberW * t;
          y1 = chamberY - stubLen;
          y2 = chamberY;
          break;
        case "bottom":
          x1 = x2 = chamberX + chamberW * t;
          y1 = chamberBottomY;
          y2 = chamberBottomY + stubLen;
          break;
      }
      stubElements.push(
        <g key={p.pipeId}>
          <line
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke={color}
            strokeWidth={thick}
            strokeLinecap="round"
          />
          <text
            x={(x1 + x2) / 2 + (group.side === "left" ? -6 : group.side === "right" ? 6 : 0)}
            y={(y1 + y2) / 2 + (group.side === "top" ? -6 : group.side === "bottom" ? 12 : 0)}
            fontSize={9}
            textAnchor={group.side === "left" ? "end" : group.side === "right" ? "start" : "middle"}
            fill={color}
            fontFamily="var(--font-mono)"
          >
            DN{p.dn_mm}
          </text>
        </g>,
      );
    });
  }

  return (
    <svg
      width={width}
      height={drawH}
      role="img"
      aria-label="Well cross-section"
      data-testid="well-svg"
      style={{ display: "block", background: "var(--bg)", borderRadius: 6, marginBottom: 12 }}
    >
      {/* Ground line + hatched fill above the chamber. */}
      <line x1={0} y1={groundY} x2={width} y2={groundY} stroke={PALETTE.ground} strokeWidth={1.5} />
      <text x={4} y={groundY - 4} fontSize={10} fill={PALETTE.ground} fontFamily="var(--font-mono)">
        Газрын гадаргуу
      </text>

      {/* Chamber rectangle. */}
      <rect
        x={chamberX}
        y={chamberY}
        width={chamberW}
        height={chamberH}
        fill={PALETTE.chamberFill}
        stroke={PALETTE.chamberStroke}
        strokeWidth={1.5}
      />
      {/* Manhole cover (ellipse-on-top look). */}
      <ellipse
        cx={coverCx}
        cy={coverCy}
        rx={coverWpx / 2}
        ry={4}
        fill={PALETTE.cover}
      />
      {/* Pipe stubs. */}
      {stubElements}

      {/* Dimension callouts (length below the chamber, depth on the
          right). Engineering convention — arrowed inside ticks. */}
      <DimensionLineH
        x1={chamberX}
        x2={chamberX + chamberW}
        y={chamberBottomY + 30}
        label={`L = ${detail.length_m} м`}
      />
      <DimensionLineV
        x={chamberX + chamberW + 30}
        y1={chamberY}
        y2={chamberBottomY}
        label={`H = ${detail.depth_m} м`}
      />
      <text
        x={coverCx}
        y={coverCy - 8}
        fontSize={9}
        textAnchor="middle"
        fill={PALETTE.cover}
        fontFamily="var(--font-mono)"
      >
        Хучилт Ø{detail.coverDiameter_mm}
      </text>
    </svg>
  );
}

function DimensionLineH({
  x1,
  x2,
  y,
  label,
}: {
  x1: number;
  x2: number;
  y: number;
  label: string;
}) {
  return (
    <g>
      <line x1={x1} y1={y - 4} x2={x1} y2={y + 4} stroke={PALETTE.dim} strokeWidth={1} />
      <line x1={x2} y1={y - 4} x2={x2} y2={y + 4} stroke={PALETTE.dim} strokeWidth={1} />
      <line x1={x1} y1={y} x2={x2} y2={y} stroke={PALETTE.dim} strokeWidth={1} />
      <text
        x={(x1 + x2) / 2}
        y={y - 6}
        fontSize={11}
        textAnchor="middle"
        fill={PALETTE.dim}
        fontFamily="var(--font-mono)"
      >
        {label}
      </text>
    </g>
  );
}

function DimensionLineV({
  x,
  y1,
  y2,
  label,
}: {
  x: number;
  y1: number;
  y2: number;
  label: string;
}) {
  return (
    <g>
      <line x1={x - 4} y1={y1} x2={x + 4} y2={y1} stroke={PALETTE.dim} strokeWidth={1} />
      <line x1={x - 4} y1={y2} x2={x + 4} y2={y2} stroke={PALETTE.dim} strokeWidth={1} />
      <line x1={x} y1={y1} x2={x} y2={y2} stroke={PALETTE.dim} strokeWidth={1} />
      <text
        x={x + 6}
        y={(y1 + y2) / 2}
        fontSize={11}
        alignmentBaseline="middle"
        fill={PALETTE.dim}
        fontFamily="var(--font-mono)"
      >
        {label}
      </text>
    </g>
  );
}

/* ─── Penetrations table ───────────────────────────────────────── */

function PenetrationsTable({ detail }: { detail: WellDetail }) {
  if (detail.penetrations.length === 0) {
    return (
      <div style={emptySubsection} data-testid="well-no-penetrations">
        Энэ худаганд хоолой холбогдоогүй байна.
      </div>
    );
  }
  return (
    <div style={subsectionStyle} data-testid="well-penetrations">
      <h4 style={subsectionHeading}>Хоолойн орц</h4>
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={thStyle}>Тал</th>
            <th style={thStyle}>Хөрш</th>
            <th style={thNumStyle}>DN</th>
            <th style={thStyle}>Контур</th>
          </tr>
        </thead>
        <tbody>
          {detail.penetrations.map((p) => (
            <tr key={p.pipeId}>
              <td style={tdStyle}>{sideLabel(p.side)}</td>
              <td style={tdStyle}>{p.neighbourLabel}</td>
              <td style={tdNumStyle}>{p.dn_mm}</td>
              <td style={tdStyle}>{p.circuit ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ─── Styles ───────────────────────────────────────────────────── */

const containerStyle: CSSProperties = {
  padding: 12,
  height: "100%",
  display: "flex",
  flexDirection: "column",
  overflow: "auto",
};

const summaryGrid: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 10,
  marginBottom: 10,
};

const statBoxStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 2,
  padding: "4px 8px",
  background: "var(--bg-elev)",
  border: "1px solid var(--border-soft)",
  borderRadius: 6,
  minWidth: 110,
};

const advisoryStyle: CSSProperties = {
  flexBasis: "100%",
  padding: "6px 10px",
  background: "rgba(196, 68, 68, 0.08)",
  border: "1px solid rgba(196, 68, 68, 0.3)",
  borderRadius: 6,
  color: "var(--danger, #C44)",
  fontSize: 12,
};

const dimsForm: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 12,
  marginBottom: 12,
};

const fieldStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 2,
};

const inputStyle: CSSProperties = {
  padding: "4px 8px",
  background: "var(--bg)",
  color: "var(--fg)",
  border: "1px solid var(--border)",
  borderRadius: 4,
  fontFamily: "var(--font-mono)",
  fontSize: 13,
  width: 110,
};

const subsectionStyle: CSSProperties = {
  marginBottom: 14,
};

const subsectionHeading: CSSProperties = {
  margin: "0 0 6px 0",
  fontSize: 13,
  color: "var(--fg-muted)",
  fontWeight: 600,
};

const tableStyle: CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 12,
  fontFamily: "var(--font-mono)",
};

const thStyle: CSSProperties = {
  textAlign: "left",
  padding: "4px 8px",
  background: "var(--bg-elev)",
  borderBottom: "1px solid var(--border)",
  color: "var(--fg-muted)",
  fontWeight: 600,
};

const thNumStyle: CSSProperties = {
  ...thStyle,
  textAlign: "right",
};

const tdStyle: CSSProperties = {
  padding: "4px 8px",
  borderBottom: "1px solid var(--border-soft)",
  color: "var(--fg)",
};

const tdNumStyle: CSSProperties = {
  ...tdStyle,
  textAlign: "right",
};

const errorBanner: CSSProperties = {
  padding: "0.75rem 1rem",
  background: "var(--bg-elev)",
  border: "1px solid var(--border-soft)",
  borderRadius: 6,
  color: "var(--fg-muted)",
  fontSize: 13,
};

const emptySubsection: CSSProperties = {
  ...errorBanner,
  marginBottom: 14,
};
