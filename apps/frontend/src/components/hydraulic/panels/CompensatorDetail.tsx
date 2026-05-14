/**
 * Phase 8.4 — Compensator detail view.
 *
 * Cross-section drawing of the selected compensator (Ω-bend or
 * sильfон) with dimensions + back-of-envelope thermal expansion
 * estimate (per СП 124.13330 §11.3).
 *
 * Inline-edit dimensions per Phase 8 architectural decision #1.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useHydraulicStore } from "../hydraulicStore";
import {
  buildCompensatorDetail,
  DEFAULT_COMPENSATOR_DIMS,
  variantLabel,
  type CompensatorDetail,
  type CompensatorDetailError,
} from "../scheme/compensatorDetail";

const PALETTE = {
  pipe: "#A32D2D",
  anchor: "#5F5E5A",
  dim: "var(--fg-muted)",
  axis: "var(--fg-muted)",
};

export function CompensatorDetail() {
  const nodes = useHydraulicStore((s) => s.nodes);
  const selection = useHydraulicStore((s) => s.selection);
  const updateNode = useHydraulicStore((s) => s.updateNode);

  const view = useMemo<CompensatorDetail | CompensatorDetailError>(
    () => buildCompensatorDetail(nodes, selection),
    [nodes, selection],
  );

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
    <div ref={containerRef} style={containerStyle} data-testid="compensator-detail">
      <header style={{ marginBottom: 12 }}>
        <h3 style={{ margin: 0 }}>🔄 Компенсаторын зураг</h3>
        <p style={{ margin: "0.25rem 0", fontSize: 13, color: "var(--fg-muted)" }}>
          Ω / сильфон компенсаторын деталь зураг. ГОСТ 21.605 + СП 124.13330 §11.3-н
          дагуу геометр + дулааны тэлэлтийн тооцоо.
        </p>
      </header>

      {"error" in view ? (
        <div style={errorBanner} data-testid="compensator-error">{view.error}</div>
      ) : (
        <>
          <CompHeader detail={view} />
          <DimensionsForm detail={view} updateNode={updateNode} />
          <CompensatorSVG detail={view} width={width} />
          <ExpansionTable detail={view} />
        </>
      )}
    </div>
  );
}

/* ─── Header ────────────────────────────────────────────────── */

function CompHeader({ detail }: { detail: CompensatorDetail }) {
  return (
    <div style={summaryGrid} data-testid="compensator-header">
      <Stat label="Компенсатор" value={detail.label} />
      <Stat label="Хэлбэр" value={variantLabel(detail.variant)} />
      <Stat label="Радиус R" value={`${detail.bendRadius_mm} мм`} />
      <Stat label="Гар h" value={`${detail.armHeight_m} м`} />
      <Stat label="Сунгалт L" value={`${detail.span_m} м`} />
      <Stat
        label="ΔL тооцоо"
        value={`${detail.estimatedExpansion_mm.toFixed(1)} мм`}
      />
      {!detail.hasExplicitDimensions && (
        <div style={advisoryStyle} data-testid="compensator-default-advisory">
          ⚠ Хэмжээ оруулаагүй учир default утга
          ({DEFAULT_COMPENSATOR_DIMS.bendRadius_mm} мм / {DEFAULT_COMPENSATOR_DIMS.armHeight_m} м /{" "}
          {DEFAULT_COMPENSATOR_DIMS.span_m} м). Доорх талбараас бодит хэмжээг оруулна уу.
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

/* ─── Inline edit form ──────────────────────────────────────── */

function DimensionsForm({
  detail,
  updateNode,
}: {
  detail: CompensatorDetail;
  updateNode: (id: string, patch: Partial<{ bendRadius_mm: number; armHeight_m: number; span_m: number }>) => void;
}) {
  return (
    <div style={dimsForm} data-testid="compensator-dimensions-form">
      <NumField
        label="Радиус R (мм)"
        value={detail.bendRadius_mm}
        onChange={(v) => updateNode(detail.nodeId, { bendRadius_mm: v })}
        step={50}
        min={50}
        max={3000}
      />
      <NumField
        label="Гар h (м)"
        value={detail.armHeight_m}
        onChange={(v) => updateNode(detail.nodeId, { armHeight_m: v })}
        step={0.1}
        min={0.2}
        max={10}
      />
      <NumField
        label="Сунгалт L (м)"
        value={detail.span_m}
        onChange={(v) => updateNode(detail.nodeId, { span_m: v })}
        step={0.1}
        min={0.5}
        max={20}
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

/* ─── Detail SVG ────────────────────────────────────────────── */

function CompensatorSVG({ detail, width }: { detail: CompensatorDetail; width: number }) {
  const PAD = 60;
  const drawW = Math.max(200, width - PAD * 2);
  // Convert geometry m → screen px. Choose px-per-m so the span fits
  // in ~60% of the width.
  const pxPerM = Math.min(120, (drawW * 0.6) / Math.max(detail.span_m, 0.5));
  const pipeY = 220; // pipe centerline
  const xCenter = PAD + drawW / 2;
  const spanPx = detail.span_m * pxPerM;
  const armPx = detail.armHeight_m * pxPerM;
  const radiusPx = (detail.bendRadius_mm / 1000) * pxPerM;
  const drawH = 320;

  let bendShape: JSX.Element;
  if (detail.variant === "u" || detail.variant === "other") {
    // Ω-bend: arms go up + semicircle on top.
    const leftArmX = xCenter - spanPx / 2;
    const rightArmX = xCenter + spanPx / 2;
    const armTopY = pipeY - armPx;
    // Semicircle from (leftArmX, armTopY) → (rightArmX, armTopY)
    // bulging upward, radius = spanPx / 2 OR radiusPx (we use the
    // larger so the top stays above the arms).
    const arcR = Math.max(spanPx / 2, radiusPx);
    bendShape = (
      <>
        <line x1={leftArmX} y1={pipeY} x2={leftArmX} y2={armTopY} stroke={PALETTE.pipe} strokeWidth={4} />
        <line x1={rightArmX} y1={pipeY} x2={rightArmX} y2={armTopY} stroke={PALETTE.pipe} strokeWidth={4} />
        <path
          d={`M ${leftArmX} ${armTopY} A ${arcR} ${arcR} 0 0 1 ${rightArmX} ${armTopY}`}
          fill="none"
          stroke={PALETTE.pipe}
          strokeWidth={4}
        />
      </>
    );
  } else if (detail.variant === "bellow") {
    // Sильfон: accordion shape — series of zigzag lines.
    const segments = 6;
    const segH = 12;
    const segW = spanPx / segments;
    let path = `M ${xCenter - spanPx / 2} ${pipeY}`;
    for (let i = 0; i < segments; i += 1) {
      const x = xCenter - spanPx / 2 + (i + 1) * segW;
      const y = pipeY + (i % 2 === 0 ? -segH : segH);
      path += ` L ${x} ${y}`;
    }
    path += ` L ${xCenter + spanPx / 2} ${pipeY}`;
    bendShape = (
      <path d={path} fill="none" stroke={PALETTE.pipe} strokeWidth={4} strokeLinejoin="round" />
    );
  } else {
    // Axial: simple horizontal stretch indicator.
    bendShape = (
      <>
        <line x1={xCenter - spanPx / 2} y1={pipeY} x2={xCenter + spanPx / 2} y2={pipeY} stroke={PALETTE.pipe} strokeWidth={4} />
        <path
          d={`M ${xCenter - 4} ${pipeY - 8} L ${xCenter + 4} ${pipeY - 8} L ${xCenter + 4} ${pipeY + 8} L ${xCenter - 4} ${pipeY + 8} Z`}
          fill="none"
          stroke={PALETTE.pipe}
          strokeWidth={2}
        />
      </>
    );
  }

  // Pipe stubs out to either side beyond the compensator span.
  const stubLen = 60;
  const leftStubX = xCenter - spanPx / 2 - stubLen;
  const rightStubX = xCenter + spanPx / 2 + stubLen;

  // Anchor blocks (filled rectangles) flanking the compensator.
  const anchorW = 16;
  const anchorH = 18;
  const anchorY = pipeY - anchorH / 2;

  return (
    <svg
      width={width}
      height={drawH}
      role="img"
      aria-label="Compensator detail"
      data-testid="compensator-svg"
      style={{ display: "block", background: "var(--bg)", borderRadius: 6, marginBottom: 12 }}
    >
      {/* Pipe centerline + stubs. */}
      <line x1={leftStubX} y1={pipeY} x2={xCenter - spanPx / 2} y2={pipeY} stroke={PALETTE.pipe} strokeWidth={4} />
      <line x1={xCenter + spanPx / 2} y1={pipeY} x2={rightStubX} y2={pipeY} stroke={PALETTE.pipe} strokeWidth={4} />

      {/* Anchor blocks. */}
      <rect x={leftStubX - anchorW - 4} y={anchorY} width={anchorW} height={anchorH} fill={PALETTE.anchor} />
      <text x={leftStubX - anchorW / 2 - 4} y={anchorY + anchorH + 12} fontSize={10} textAnchor="middle" fill={PALETTE.anchor} fontFamily="var(--font-mono)">
        НТ-1
      </text>
      <rect x={rightStubX + 4} y={anchorY} width={anchorW} height={anchorH} fill={PALETTE.anchor} />
      <text x={rightStubX + anchorW / 2 + 4} y={anchorY + anchorH + 12} fontSize={10} textAnchor="middle" fill={PALETTE.anchor} fontFamily="var(--font-mono)">
        НТ-2
      </text>

      {/* The bend itself. */}
      {bendShape}

      {/* Span callout below. */}
      <DimensionLineH
        x1={xCenter - spanPx / 2}
        x2={xCenter + spanPx / 2}
        y={pipeY + 50}
        label={`L = ${detail.span_m} м`}
      />

      {/* Arm height callout (for u-bends). */}
      {(detail.variant === "u" || detail.variant === "other") && (
        <DimensionLineV
          x={xCenter + spanPx / 2 + 40}
          y1={pipeY - armPx}
          y2={pipeY}
          label={`h = ${detail.armHeight_m} м`}
        />
      )}

      {/* Radius callout for u-bends — at the apex. */}
      {(detail.variant === "u" || detail.variant === "other") && (
        <text
          x={xCenter}
          y={pipeY - armPx - 14}
          fontSize={11}
          textAnchor="middle"
          fill={PALETTE.dim}
          fontFamily="var(--font-mono)"
        >
          R = {detail.bendRadius_mm} мм
        </text>
      )}
    </svg>
  );
}

function DimensionLineH({
  x1, x2, y, label,
}: {
  x1: number; x2: number; y: number; label: string;
}) {
  return (
    <g>
      <line x1={x1} y1={y - 4} x2={x1} y2={y + 4} stroke={PALETTE.dim} strokeWidth={1} />
      <line x1={x2} y1={y - 4} x2={x2} y2={y + 4} stroke={PALETTE.dim} strokeWidth={1} />
      <line x1={x1} y1={y} x2={x2} y2={y} stroke={PALETTE.dim} strokeWidth={1} />
      <text x={(x1 + x2) / 2} y={y - 6} fontSize={11} textAnchor="middle" fill={PALETTE.dim} fontFamily="var(--font-mono)">
        {label}
      </text>
    </g>
  );
}

function DimensionLineV({
  x, y1, y2, label,
}: {
  x: number; y1: number; y2: number; label: string;
}) {
  return (
    <g>
      <line x1={x - 4} y1={y1} x2={x + 4} y2={y1} stroke={PALETTE.dim} strokeWidth={1} />
      <line x1={x - 4} y1={y2} x2={x + 4} y2={y2} stroke={PALETTE.dim} strokeWidth={1} />
      <line x1={x} y1={y1} x2={x} y2={y2} stroke={PALETTE.dim} strokeWidth={1} />
      <text x={x + 6} y={(y1 + y2) / 2} fontSize={11} alignmentBaseline="middle" fill={PALETTE.dim} fontFamily="var(--font-mono)">
        {label}
      </text>
    </g>
  );
}

/* ─── Expansion table ───────────────────────────────────────── */

function ExpansionTable({ detail }: { detail: CompensatorDetail }) {
  return (
    <div style={subsectionStyle} data-testid="compensator-expansion">
      <h4 style={subsectionHeading}>Дулааны тэлэлтийн тооцоо</h4>
      <table style={tableStyle}>
        <tbody>
          <tr>
            <td style={tdStyle}>Тэлэлтийн коэф. α (ган)</td>
            <td style={tdNumStyle}>1.2 × 10⁻⁵ 1/°C</td>
          </tr>
          <tr>
            <td style={tdStyle}>Температурын зөрөө ΔT</td>
            <td style={tdNumStyle}>75 °C (95 − 20)</td>
          </tr>
          <tr>
            <td style={tdStyle}>Сунгалт L</td>
            <td style={tdNumStyle}>{detail.span_m} м</td>
          </tr>
          <tr>
            <td style={tdStyle}>
              <b>ΔL = α · L · ΔT</b>
            </td>
            <td style={tdNumStyle}>
              <b>{detail.estimatedExpansion_mm.toFixed(1)} мм</b>
            </td>
          </tr>
        </tbody>
      </table>
      <p style={{ fontSize: 11, color: "var(--fg-muted)", margin: "6px 0 0" }}>
        СП 124.13330 §11.3. Энэ нь back-of-envelope тооцоо — нарийн pre-stress
        + анкер ачаалал тооцоолох бол Phase 11-д тооцооны модул нэмэгдэх болно.
      </p>
    </div>
  );
}

/* ─── Styles ───────────────────────────────────────────────── */

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
  width: "auto",
  borderCollapse: "collapse",
  fontSize: 12,
  fontFamily: "var(--font-mono)",
};

const tdStyle: CSSProperties = {
  padding: "4px 12px",
  borderBottom: "1px solid var(--border-soft)",
  color: "var(--fg)",
};

const tdNumStyle: CSSProperties = {
  ...tdStyle,
  textAlign: "right",
  minWidth: 120,
};

const errorBanner: CSSProperties = {
  padding: "0.75rem 1rem",
  background: "var(--bg-elev)",
  border: "1px solid var(--border-soft)",
  borderRadius: 6,
  color: "var(--fg-muted)",
  fontSize: 13,
};
