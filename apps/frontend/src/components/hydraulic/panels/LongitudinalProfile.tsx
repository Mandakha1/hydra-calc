/**
 * Phase 8.1 — Longitudinal profile view (read-only).
 *
 * Renders the source → worst-served-consumer ground profile as an
 * inline SVG, following the PiezometricView template (no chart-lib
 * dependency, ResizeObserver-driven, derives from store).
 *
 * What the engineer sees:
 *   - X axis: chainage in km+m (ГОСТ 21.605 format), tick step
 *     chosen automatically for 6-12 labels.
 *   - Y axis: elevation in metres.
 *   - Ground line (brown) tracing node elevations.
 *   - Faint pipe-centerline track (dashed brown) at `ground -
 *     burialDepth_m` where the pipe carries a burial depth.
 *   - Node markers at every chainage with engineer-friendly labels
 *     stacked vertically so they don't collide.
 *   - Stats strip: total length, low / high point.
 *
 * Empty / error states:
 *   - "No source" / "no pipes" → friendly banner explaining what
 *     the engineer needs to draw first.
 *   - "No elevation data" → renders a flat trace + advisory tag
 *     so the engineer still gets a sense of the path topology and
 *     knows to fill in elevations.
 *
 * Standard references:
 *   - СП 124.13330.2012 §7.4 (magistral path)
 *   - ГОСТ 21.605 (chainage label km+m)
 *   - БНбД 41-01-2019 §6.3 (worst-served consumer)
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useHydraulicStore } from "../hydraulicStore";
import {
  buildLongitudinalProfile,
  formatChainage,
  pickChainageTickStep,
  pickElevationTickStep,
  type ProfileError,
  type ProfileTrace,
} from "../scheme/longitudinalProfile";

const PALETTE = {
  ground: "#BA7517",
  pipe: "#A32D2D",
  marker: "var(--fg)",
  markerSource: "#A32D2D",
  markerConsumer: "var(--accent)",
  axis: "var(--fg-muted)",
  advisory: "#C44",
};

export function LongitudinalProfile() {
  const nodes = useHydraulicStore((s) => s.nodes);
  const pipes = useHydraulicStore((s) => s.pipes);

  const trace = useMemo<ProfileTrace | ProfileError>(
    () => buildLongitudinalProfile(nodes, pipes),
    [nodes, pipes],
  );

  // ResizeObserver — same pattern as PiezometricView.
  const containerRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ w: 800, h: 360 });
  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const ro = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) {
        setDims({
          w: Math.max(400, rect.width - 24),
          h: Math.max(260, rect.height - 160),
        });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={containerRef} style={containerStyle} data-testid="longitudinal-profile">
      <header style={{ marginBottom: 12 }}>
        <h3 style={{ margin: 0 }}>📊 Урт огтлол / Longitudinal profile</h3>
        <p style={{ margin: "0.25rem 0", fontSize: 13, color: "var(--fg-muted)" }}>
          Эх үүсвэрээс хамгийн алс хэрэглэгч хүртэлх газрын өндөр + хоолойн
          байрлал. СП 124.13330 §7.4 + БНбД 41-01 §6.3-н дагуу
          magistral шугам тооцоологдоно.
        </p>
      </header>

      {"error" in trace ? (
        <div style={errorBanner} data-testid="profile-error">{trace.error}</div>
      ) : (
        <>
          <Stats trace={trace} />
          <ProfileChart trace={trace} width={dims.w} height={dims.h} />
          <Legend />
        </>
      )}
    </div>
  );
}

/* ─── Stats strip ──────────────────────────────────────────────── */

function Stats({ trace }: { trace: ProfileTrace }) {
  const lowPoint = trace.points.reduce(
    (lo, p) => (p.elevation_m < lo.elevation_m ? p : lo),
    trace.points[0]!,
  );
  const highPoint = trace.points.reduce(
    (hi, p) => (p.elevation_m > hi.elevation_m ? p : hi),
    trace.points[0]!,
  );
  return (
    <div style={statsStyle} data-testid="profile-stats">
      <Stat label="Нийт урт" value={`${formatChainage(trace.totalLength_m)} (${Math.round(trace.totalLength_m)} м)`} />
      <Stat label="Хамгийн нам" value={trace.anyElevation ? `${lowPoint.elevation_m.toFixed(1)} м (${lowPoint.label})` : "—"} />
      <Stat label="Хамгийн өндөр" value={trace.anyElevation ? `${highPoint.elevation_m.toFixed(1)} м (${highPoint.label})` : "—"} />
      <Stat label="Цэг" value={`${trace.points.length}`} />
      {!trace.anyElevation && (
        <div style={advisoryStyle} data-testid="profile-no-elev-advisory">
          ⚠ Аль ч зангилаа дээр өндөр (h, м) утга байхгүй. Inspector →
          {" «h (м)» "}талбараас оруулна уу — графикийн босоо тэнхлэгт
          тэнцвэртэй (0 м) утгаар орлуулсан байна.
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={statBox}>
      <span style={{ fontSize: 11, color: "var(--fg-muted)" }}>{label}</span>
      <span style={{ fontSize: 13, fontFamily: "var(--font-mono)", fontWeight: 600 }}>{value}</span>
    </div>
  );
}

/* ─── SVG chart ────────────────────────────────────────────────── */

function ProfileChart({
  trace,
  width,
  height,
}: {
  trace: ProfileTrace;
  width: number;
  height: number;
}) {
  const PAD_L = 56;
  const PAD_R = 16;
  const PAD_T = 20;
  const PAD_B = 70; // extra space for stacked node labels
  const plotW = width - PAD_L - PAD_R;
  const plotH = height - PAD_T - PAD_B;

  const xMin = 0;
  const xMax = Math.max(1, trace.totalLength_m);
  // Pad the elevation axis 10% above + below the range so the ground
  // line doesn't crash into the chart edges.
  const elevRange = Math.max(1, trace.maxElevation_m - trace.minElevation_m);
  const yPad = Math.max(1, elevRange * 0.1);
  const yMin = trace.minElevation_m - yPad;
  const yMax = trace.maxElevation_m + yPad;

  const xFor = (x: number) => PAD_L + ((x - xMin) / Math.max(1, xMax - xMin)) * plotW;
  const yFor = (y: number) => PAD_T + (1 - (y - yMin) / Math.max(0.001, yMax - yMin)) * plotH;

  // Ticks
  const xStep = pickChainageTickStep(trace.totalLength_m);
  const xTicks: number[] = [];
  for (let x = 0; x <= trace.totalLength_m + 1e-6; x += xStep) xTicks.push(Math.round(x));
  const yStep = pickElevationTickStep(yMax - yMin);
  const yTicks: number[] = [];
  for (let y = Math.ceil(yMin / yStep) * yStep; y <= yMax + 1e-6; y += yStep) yTicks.push(Number(y.toFixed(2)));

  // Ground polyline (closed at the bottom for fill).
  const groundLine = trace.points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${xFor(p.chainage_m)},${yFor(p.elevation_m)}`)
    .join(" ");
  const groundFill = `${groundLine} L ${xFor(xMax)},${yFor(yMin)} L ${xFor(xMin)},${yFor(yMin)} Z`;

  // Pipe centerline track (faint dashed). Renders at `ground -
  // burialDepth_m` when the entry pipe carried a burial depth. Draws
  // as a segmented polyline between consecutive points that BOTH
  // carry burial depth so gaps stay visible.
  const pipeSegs: string[] = [];
  for (let i = 1; i < trace.points.length; i += 1) {
    const a = trace.points[i - 1]!;
    const b = trace.points[i]!;
    const depthB = b.entryBurialDepth_m;
    if (typeof depthB !== "number") continue;
    // a's pipe-centerline-y uses the SAME segment's burial depth
    // (so the pipe is a continuous slope between adjacent nodes).
    const ay = a.elevation_m - depthB;
    const by = b.elevation_m - depthB;
    pipeSegs.push(`M ${xFor(a.chainage_m)},${yFor(ay)} L ${xFor(b.chainage_m)},${yFor(by)}`);
  }
  const pipeTrack = pipeSegs.join(" ");

  return (
    <svg
      width={width}
      height={height}
      role="img"
      aria-label="Longitudinal profile"
      data-testid="profile-svg"
      style={{ display: "block", background: "var(--bg)", borderRadius: 6 }}
    >
      {/* gridlines */}
      {yTicks.map((y) => (
        <line key={`gy${y}`} x1={PAD_L} y1={yFor(y)} x2={width - PAD_R} y2={yFor(y)} stroke="var(--border-soft)" strokeWidth={0.5} />
      ))}
      {xTicks.map((x) => (
        <line key={`gx${x}`} x1={xFor(x)} y1={PAD_T} x2={xFor(x)} y2={height - PAD_B} stroke="var(--border-soft)" strokeWidth={0.5} />
      ))}

      {/* axes */}
      <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={height - PAD_B} stroke={PALETTE.axis} strokeWidth={1} />
      <line x1={PAD_L} y1={height - PAD_B} x2={width - PAD_R} y2={height - PAD_B} stroke={PALETTE.axis} strokeWidth={1} />

      {/* Y axis labels (elevation in m). */}
      {yTicks.map((y) => (
        <text key={`yl${y}`} x={PAD_L - 6} y={yFor(y)} fontSize={10} textAnchor="end" alignmentBaseline="middle" fill={PALETTE.axis} fontFamily="var(--font-mono)">
          {y}
        </text>
      ))}
      <text x={PAD_L - 36} y={PAD_T - 2} fontSize={10} fill={PALETTE.axis} fontFamily="var(--font-mono)">м</text>

      {/* X axis labels (chainage in km+m). */}
      {xTicks.map((x) => (
        <text key={`xl${x}`} x={xFor(x)} y={height - PAD_B + 14} fontSize={10} textAnchor="middle" fill={PALETTE.axis} fontFamily="var(--font-mono)">
          {formatChainage(x)}
        </text>
      ))}

      {/* Ground fill + line. */}
      <path d={groundFill} fill={PALETTE.ground} fillOpacity={0.15} stroke="none" />
      <path d={groundLine} fill="none" stroke={PALETTE.ground} strokeWidth={2} />

      {/* Pipe centerline track (faint dashed, only on segments with
          burial depth data). */}
      {pipeTrack && (
        <path d={pipeTrack} fill="none" stroke={PALETTE.pipe} strokeWidth={1.5} strokeDasharray="6 3" opacity={0.7} />
      )}

      {/* Node markers + stacked labels. Source = red marker;
          terminal consumer = accent. Others = small grey ticks. */}
      {trace.points.map((p, i) => {
        const isSrc = p.nodeId === trace.sourceId;
        const isTerm = p.nodeId === trace.terminalId;
        const color = isSrc ? PALETTE.markerSource : isTerm ? PALETTE.markerConsumer : PALETTE.marker;
        const r = isSrc || isTerm ? 4 : 2.5;
        const cx = xFor(p.chainage_m);
        const cy = yFor(p.elevation_m);
        // Stack labels — even-indexed below the axis, odd-indexed
        // 12 px lower so adjacent labels don't collide.
        const labelY = height - PAD_B + 28 + (i % 2) * 14;
        return (
          <g key={p.nodeId}>
            {/* drop-line from ground to chainage tick */}
            <line x1={cx} y1={cy} x2={cx} y2={height - PAD_B} stroke={color} strokeWidth={isSrc || isTerm ? 1 : 0.5} strokeDasharray="2 3" opacity={0.55} />
            <circle cx={cx} cy={cy} r={r} fill={color} stroke="var(--bg)" strokeWidth={1} />
            <text
              x={cx}
              y={labelY}
              fontSize={9.5}
              textAnchor="middle"
              fill={color}
              fontFamily="var(--font-mono)"
              fontWeight={isSrc || isTerm ? 700 : 400}
            >
              {p.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/* ─── Legend ───────────────────────────────────────────────────── */

function Legend() {
  return (
    <div style={legendStyle}>
      <LegendItem color={PALETTE.ground} label="Газрын өндөр" stroke />
      <LegendItem color={PALETTE.pipe} label="Хоолойн төв шугам (булшилсан)" stroke dashed />
      <LegendItem color={PALETTE.markerSource} label="Эх үүсвэр" />
      <LegendItem color={PALETTE.markerConsumer} label="Алс хэрэглэгч" />
    </div>
  );
}

function LegendItem({
  color,
  label,
  stroke,
  dashed,
}: {
  color: string;
  label: string;
  stroke?: boolean;
  dashed?: boolean;
}) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--fg-muted)" }}>
      {stroke ? (
        <svg width={22} height={10}>
          <line
            x1={0}
            y1={5}
            x2={22}
            y2={5}
            stroke={color}
            strokeWidth={2}
            strokeDasharray={dashed ? "4 3" : undefined}
          />
        </svg>
      ) : (
        <span style={{ width: 10, height: 10, borderRadius: "50%", background: color, display: "inline-block" }} />
      )}
      {label}
    </span>
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

const statsStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 10,
  marginBottom: 10,
  alignItems: "stretch",
};

const statBox: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 2,
  padding: "4px 8px",
  background: "var(--bg-elev)",
  border: "1px solid var(--border-soft)",
  borderRadius: 6,
  minWidth: 110,
};

const errorBanner: CSSProperties = {
  padding: "0.75rem 1rem",
  background: "var(--bg-elev)",
  border: "1px solid var(--border-soft)",
  borderRadius: 6,
  color: "var(--fg-muted)",
  fontSize: 13,
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

const legendStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 16,
  marginTop: 8,
};
