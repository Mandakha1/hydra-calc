/**
 * Phase 8.5 — УДДТ P&ID view.
 *
 * Auto-layout P&ID from the source's directed pipe graph. Ladder-
 * style left-to-right, sensors drawn above the trunk to avoid
 * collision with the pipe path. Read-only per Phase 8 decision #1
 * (engineer edits Plan view to change the underlying topology).
 *
 * Standards followed:
 *   - ГОСТ 21.404 (simplified)  — instrumentation circle + letter
 *   - ISA S5.1                  — P&ID symbol shapes (gate valve,
 *                                 pump rotor)
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useHydraulicStore } from "../hydraulicStore";
import {
  buildPidLayout,
  roleLabel,
  type PidElement,
  type PidLayout,
  type PidError,
} from "../scheme/pid";

const PALETTE = {
  source: "#A32D2D",
  pump: "#1F5FAA",
  valve: "#BA7517",
  sensor: "#185FA5",
  consumer: "var(--accent)",
  chamber: "var(--success)",
  pipe: "#5F5E5A",
  pipeSupply: "#A32D2D",
  pipeReturn: "#1F5FAA",
  text: "var(--fg)",
  axis: "var(--fg-muted)",
};

const COLOR_BY_CIRCUIT: Record<string, string> = {
  heating_supply: PALETTE.pipeSupply,
  heating_return: PALETTE.pipeReturn,
};

const ELEMENT_SIZE = 36;
const COL_STEP = 110;
const PAD_L = 60;
const PAD_T = 80;
const ROW_TRUNK_Y = 60;
const ROW_SENSOR_Y = -40;

export function UddtPid() {
  const nodes = useHydraulicStore((s) => s.nodes);
  const pipes = useHydraulicStore((s) => s.pipes);

  const layout = useMemo<PidLayout | PidError>(
    () => buildPidLayout(nodes, pipes),
    [nodes, pipes],
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const ro = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) setWidth(Math.max(500, rect.width - 24));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={containerRef} style={containerStyle} data-testid="uddt-pid">
      <header style={{ marginBottom: 12 }}>
        <h3 style={{ margin: 0 }}>🛠 УДДТ — Process &amp; Instrumentation</h3>
        <p style={{ margin: "0.25rem 0", fontSize: 13, color: "var(--fg-muted)" }}>
          Эх үүсвэрээс эхэлсэн авто layout P&amp;ID. ГОСТ 21.404 + ISA S5.1
          стандартын дагуу хялбарчилсан зураг.
        </p>
      </header>

      {"error" in layout ? (
        <div style={errorBanner} data-testid="pid-error">{layout.error}</div>
      ) : (
        <>
          <Stats layout={layout} />
          <PidSvg layout={layout} width={width} />
          <Legend />
        </>
      )}
    </div>
  );
}

/* ─── Stats ─────────────────────────────────────────────────── */

function Stats({ layout }: { layout: PidLayout }) {
  const counts = new Map<string, number>();
  for (const e of layout.elements) {
    counts.set(e.role, (counts.get(e.role) ?? 0) + 1);
  }
  return (
    <div style={statsGrid} data-testid="pid-stats">
      <StatBox label="Эх үүсвэр" value={`${counts.get("source") ?? 0}`} />
      <StatBox label="Насос" value={`${counts.get("pump") ?? 0}`} />
      <StatBox label="Арматура" value={`${counts.get("valve") ?? 0}`} />
      <StatBox label="Мэдрэгч" value={`${counts.get("sensor") ?? 0}`} />
      <StatBox label="Хэрэглэгч" value={`${counts.get("consumer") ?? 0}`} />
      <StatBox label="Багана" value={`${layout.columns}`} />
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div style={statBoxStyle}>
      <span style={{ fontSize: 11, color: "var(--fg-muted)" }}>{label}</span>
      <span style={{ fontSize: 14, fontFamily: "var(--font-mono)", fontWeight: 600 }}>{value}</span>
    </div>
  );
}

/* ─── SVG diagram ───────────────────────────────────────────── */

function PidSvg({ layout, width }: { layout: PidLayout; width: number }) {
  const totalW = Math.max(width, PAD_L + layout.columns * COL_STEP);
  const totalH = PAD_T + 200; // trunk + sensor row + labels

  const elementXY = (el: PidElement): { x: number; y: number } => {
    const x = PAD_L + el.column * COL_STEP;
    const y = PAD_T + ROW_TRUNK_Y + (el.row === -1 ? ROW_SENSOR_Y : 0);
    return { x, y };
  };

  // Render edges first so symbols sit on top.
  const edgeElements: JSX.Element[] = [];
  for (const edge of layout.edges) {
    const from = layout.elements.find((e) => e.nodeId === edge.fromId);
    const to = layout.elements.find((e) => e.nodeId === edge.toId);
    if (!from || !to) continue;
    const a = elementXY(from);
    const b = elementXY(to);
    const color = COLOR_BY_CIRCUIT[edge.circuit ?? ""] ?? PALETTE.pipe;
    // Orthogonal routing: horizontal first then vertical (when rows
    // differ). Sensors connect via a vertical drop FROM the trunk.
    let path: string;
    if (from.row === to.row) {
      // Same row → straight line.
      path = `M ${a.x} ${a.y} L ${b.x} ${b.y}`;
    } else {
      // Vertical drop: turn at the destination column.
      path = `M ${a.x} ${a.y} L ${b.x} ${a.y} L ${b.x} ${b.y}`;
    }
    edgeElements.push(
      <path
        key={`e_${edge.fromId}_${edge.toId}`}
        d={path}
        fill="none"
        stroke={color}
        strokeWidth={3}
      />,
    );
  }

  // Render elements.
  const symbolElements: JSX.Element[] = [];
  for (const el of layout.elements) {
    const { x, y } = elementXY(el);
    symbolElements.push(
      <g key={el.nodeId} data-testid={`pid-${el.nodeId}`}>
        {renderSymbol(el, x, y)}
        <text
          x={x}
          y={y + ELEMENT_SIZE / 2 + 14}
          fontSize={10}
          textAnchor="middle"
          fill={PALETTE.text}
          fontFamily="var(--font-mono)"
        >
          {el.label}
        </text>
      </g>,
    );
  }

  return (
    <div style={{ overflowX: "auto", marginBottom: 12 }}>
      <svg
        width={totalW}
        height={totalH}
        role="img"
        aria-label="P&ID diagram"
        data-testid="pid-svg"
        style={{ display: "block", background: "var(--bg)", borderRadius: 6 }}
      >
        {edgeElements}
        {symbolElements}
      </svg>
    </div>
  );
}

/** Render the ISA / ГОСТ 21.404 symbol for an element. */
function renderSymbol(el: PidElement, x: number, y: number): JSX.Element {
  const r = ELEMENT_SIZE / 2;
  switch (el.role) {
    case "source":
      // Source = stylised plant rectangle.
      return (
        <g>
          <rect
            x={x - r}
            y={y - r}
            width={ELEMENT_SIZE}
            height={ELEMENT_SIZE}
            fill={PALETTE.source}
            fillOpacity={0.18}
            stroke={PALETTE.source}
            strokeWidth={2}
            rx={4}
          />
          <text x={x} y={y + 4} fontSize={11} fontWeight={700} textAnchor="middle" fill={PALETTE.source} fontFamily="var(--font-mono)">
            {el.symbol}
          </text>
        </g>
      );
    case "pump":
      // Pump = circle with arrow.
      return (
        <g>
          <circle cx={x} cy={y} r={r - 2} fill="white" stroke={PALETTE.pump} strokeWidth={2} />
          <path
            d={`M ${x - r + 6} ${y} L ${x + r - 6} ${y} M ${x + r - 10} ${y - 4} L ${x + r - 6} ${y} L ${x + r - 10} ${y + 4}`}
            fill="none"
            stroke={PALETTE.pump}
            strokeWidth={2}
            strokeLinecap="round"
          />
          <text x={x} y={y - r - 4} fontSize={9} textAnchor="middle" fill={PALETTE.pump} fontFamily="var(--font-mono)">N</text>
        </g>
      );
    case "valve": {
      // Valve = bowtie / butterfly.
      const path = `M ${x - r} ${y - r + 4} L ${x + r} ${y + r - 4} L ${x + r} ${y - r + 4} L ${x - r} ${y + r - 4} Z`;
      return (
        <g>
          <path d={path} fill="white" stroke={PALETTE.valve} strokeWidth={2} />
        </g>
      );
    }
    case "sensor":
      // Sensor = circle with letter (ГОСТ 21.404).
      return (
        <g>
          <circle cx={x} cy={y} r={r - 4} fill="white" stroke={PALETTE.sensor} strokeWidth={1.5} />
          <line x1={x - r + 4} y1={y} x2={x + r - 4} y2={y} stroke={PALETTE.sensor} strokeWidth={1} />
          <text x={x} y={y + 4} fontSize={11} fontWeight={700} textAnchor="middle" fill={PALETTE.sensor} fontFamily="var(--font-mono)">
            {el.symbol}
          </text>
        </g>
      );
    case "consumer":
      // Consumer = small house.
      return (
        <g>
          <path
            d={`M ${x - r + 4} ${y + r - 4} L ${x - r + 4} ${y - 2} L ${x} ${y - r + 2} L ${x + r - 4} ${y - 2} L ${x + r - 4} ${y + r - 4} Z`}
            fill={`color-mix(in oklab, var(--accent) 18%, transparent)`}
            stroke="var(--accent)"
            strokeWidth={1.5}
          />
          <text x={x} y={y + r + 12} fontSize={9} textAnchor="middle" fill="var(--accent)" fontFamily="var(--font-mono)">{el.symbol}</text>
        </g>
      );
    case "chamber":
      return (
        <rect x={x - r + 2} y={y - r + 4} width={ELEMENT_SIZE - 4} height={ELEMENT_SIZE - 8} fill="white" stroke={PALETTE.chamber} strokeWidth={1.5} />
      );
    case "junction":
    case "fitting":
      return <circle cx={x} cy={y} r={4} fill={PALETTE.text} />;
    default:
      return <circle cx={x} cy={y} r={3} fill={PALETTE.axis} />;
  }
}

/* ─── Legend ────────────────────────────────────────────────── */

function Legend() {
  return (
    <div style={legendStyle} data-testid="pid-legend">
      <LegendItem color={PALETTE.source} label={roleLabel("source")} shape="rect" />
      <LegendItem color={PALETTE.pump} label={roleLabel("pump")} shape="circle" />
      <LegendItem color={PALETTE.valve} label={roleLabel("valve")} shape="bowtie" />
      <LegendItem color={PALETTE.sensor} label={roleLabel("sensor")} shape="circleLetter" />
      <LegendItem color={PALETTE.pipeSupply} label="Халаалт нийлүүлэх (Т1)" stroke />
      <LegendItem color={PALETTE.pipeReturn} label="Халаалт буцах (Т2)" stroke />
    </div>
  );
}

function LegendItem({
  color,
  label,
  shape,
  stroke,
}: {
  color: string;
  label: string;
  shape?: "rect" | "circle" | "bowtie" | "circleLetter";
  stroke?: boolean;
}) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--fg-muted)" }}>
      <svg width={20} height={14}>
        {stroke ? (
          <line x1={0} y1={7} x2={20} y2={7} stroke={color} strokeWidth={2} />
        ) : shape === "rect" ? (
          <rect x={3} y={2} width={14} height={10} stroke={color} fill="white" strokeWidth={1.5} rx={2} />
        ) : shape === "bowtie" ? (
          <path d="M 2 2 L 18 12 L 18 2 L 2 12 Z" fill="white" stroke={color} strokeWidth={1.5} />
        ) : shape === "circleLetter" ? (
          <g>
            <circle cx={10} cy={7} r={5} fill="white" stroke={color} strokeWidth={1.2} />
            <line x1={5} y1={7} x2={15} y2={7} stroke={color} strokeWidth={0.8} />
          </g>
        ) : (
          <circle cx={10} cy={7} r={5} fill="white" stroke={color} strokeWidth={1.5} />
        )}
      </svg>
      {label}
    </span>
  );
}

/* ─── Styles ──────────────────────────────────────────────── */

const containerStyle: CSSProperties = {
  padding: 12,
  height: "100%",
  display: "flex",
  flexDirection: "column",
  overflow: "auto",
};

const statsGrid: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 10,
  marginBottom: 12,
};

const statBoxStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 2,
  padding: "6px 10px",
  background: "var(--bg-elev)",
  border: "1px solid var(--border-soft)",
  borderRadius: 6,
  minWidth: 90,
};

const legendStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 14,
};

const errorBanner: CSSProperties = {
  padding: "0.75rem 1rem",
  background: "var(--bg-elev)",
  border: "1px solid var(--border-soft)",
  borderRadius: 6,
  color: "var(--fg-muted)",
  fontSize: 13,
};
