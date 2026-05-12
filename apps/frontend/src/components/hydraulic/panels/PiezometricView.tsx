/**
 * Piezometric view — engineer-grade head profile chart.
 *
 * Renders the source → worst-served-consumer head trace from
 * computePiezometricProfile() as an inline SVG (no chart-library
 * dependency — keeps the bundle delta below ~5 KB). The seven datasets
 * follow the standard Russian/Mongolian piezometric diagram convention:
 *
 *   1. Ground (area fill, amber)             — elevation profile
 *   2. Supply (line, red)                    — pressurised supply head
 *   3. Return (line, blue)                   — return head
 *   4. Static (dashed gray)                  — system static pressure
 *   5. P_max envelope (dashed red)           — pipe PN rating limit
 *   6. P_min envelope (dashed blue)          — fill-the-highest-tap rule
 *   7. Building markers (vertical bars at consumer x-positions)
 *
 * The chart is fully responsive to ResizeObserver — engineers expand
 * the panel to study a long path and the axis recalibrates.
 *
 * Violations from the piezometric module are rendered as red banners
 * above the chart (БНбД 41-01 §6.3, etc).
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useHydraulicStore } from "../hydraulicStore";
import { computePiezometricProfile, type PiezometricResult } from "../calc/piezometric";
import { pickAutoSource } from "../calc/topology";

const PALETTE = {
  ground: "#BA7517",
  supply: "#A32D2D",
  ret: "#185FA5",
  staticLine: "#5F5E5A",
  pMax: "#E24B4A",
  pMin: "#378ADD",
  /** Phase 5D.3 — supply-temperature line. Amber-orange to stay
   *  distinct from supply-pressure red and ground brown. */
  supplyTemp: "#E6914F",
  axis: "var(--fg-muted)",
  bldg: "rgba(184, 117, 23, 0.35)",
};

export function PiezometricView() {
  const nodes = useHydraulicStore((s) => s.nodes);
  const pipes = useHydraulicStore((s) => s.pipes);
  const settings = useHydraulicStore((s) => s.settings);
  const results = useHydraulicStore((s) => s.results);

  // Engineer-tunable inputs. We pre-populate with the defaults the
  // calculator already uses so the panel "just works" on first open.
  const [pumpHeadM, setPumpHeadM] = useState<number>(30);
  const [staticPressureHeadM, setStaticPressureHeadM] = useState<number>(50);
  const [pn, setPn] = useState<10 | 16 | 25>(10);
  const [sourceElevationM, setSourceElevationM] = useState<number>(1269);
  // Phase 5D.3 — toggle the supply-temperature overlay. Defaults on
  // whenever results carry a heatLoss summary (engineer probably
  // cares about it); off for legacy projects that ran without heat
  // loss.
  const [showTemp, setShowTemp] = useState<boolean>(true);

  // Phase 5D.3 — supply temp per node, harvested from results.nodes.
  // When heat-loss is disabled in settings, this map will be empty
  // and the chart simply doesn't render the temp track.
  const supplyTempByNodeId = useMemo(() => {
    const m = new Map<string, number>();
    for (const nr of results?.nodes ?? []) {
      if (typeof nr.supplyTemp_C_at_inlet === "number") {
        m.set(nr.nodeId, nr.supplyTemp_C_at_inlet);
      }
    }
    return m;
  }, [results]);

  // Compute the profile. Memoise on inputs so panning the source UI
  // doesn't re-run the solver on every render.
  const profile = useMemo<PiezometricResult | { error: string }>(() => {
    if (!pickAutoSource(nodes)) return { error: "Сvлжээнд эх үүсвэр (ТЭЦ/Котельная/ЦТП/Геотермал) байхгүй байна. Эхлээд эх үүсвэрийн зангилаа нэмнэ үү." };
    if (pipes.length === 0) return { error: "Сүлжээнд хоолой байхгүй байна. Эхлээд хоолой зурна уу." };
    try {
      return computePiezometricProfile({
        nodes,
        pipes,
        settings,
        pumpHeadM,
        staticPressureHeadM,
        systemPNRating: pn,
        sourceElevationM,
        consumerElevationsM: Object.fromEntries(
          nodes.filter((n) => n.elevation_m != null).map((n) => [n.id, n.elevation_m!]),
        ),
        buildingHeightsM: Object.fromEntries(
          nodes.filter((n) => n.buildingHeight_m != null).map((n) => [n.id, n.buildingHeight_m!]),
        ),
        supplyTempByNodeId,
      });
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  }, [nodes, pipes, settings, pumpHeadM, staticPressureHeadM, pn, sourceElevationM, supplyTempByNodeId]);

  // SVG dimensions — use ResizeObserver to fill the panel.
  const containerRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ w: 800, h: 360 });
  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const ro = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) setDims({ w: Math.max(400, rect.width - 24), h: Math.max(280, rect.height - 240) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={containerRef} style={containerStyle}>
      <header style={{ marginBottom: 12 }}>
        <h3 style={{ margin: 0 }}>📈 Пьезометр</h3>
        <p style={{ margin: "0.25rem 0", fontSize: 13, color: "var(--fg-muted)" }}>
          Источник → хамгийн алс хэрэглэгч хүртэлх даралт-зайн график. БНбД 41-01 §6.3 + СП 124.13330 §7 хэмжээ.
        </p>
      </header>

      <div style={controlsStyle}>
        <NumberField label="Насос (H, м)" value={pumpHeadM} onChange={setPumpHeadM} min={0} max={150} />
        <NumberField label="Статик (м)" value={staticPressureHeadM} onChange={setStaticPressureHeadM} min={0} max={200} />
        <SelectPN value={pn} onChange={setPn} />
        <NumberField label="Эх өндөр (м)" value={sourceElevationM} onChange={setSourceElevationM} min={0} max={5000} />
        {supplyTempByNodeId.size > 0 && (
          <label
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 4,
              fontSize: 11,
              color: "var(--fg-muted)",
            }}
          >
            Темп. шугам
            <button
              type="button"
              onClick={() => setShowTemp((v) => !v)}
              style={{
                padding: "0.3rem 0.6rem",
                fontSize: 12,
                background: showTemp ? PALETTE.supplyTemp : "var(--bg)",
                color: showTemp ? "white" : "var(--fg)",
                border: `1px solid ${PALETTE.supplyTemp}`,
                borderRadius: 4,
                cursor: "pointer",
                fontFamily: "var(--font-sans)",
                fontWeight: 600,
              }}
            >
              {showTemp ? "🌡 Унтраах" : "🌡 Асаах"}
            </button>
          </label>
        )}
      </div>

      {"error" in profile ? (
        <div style={errorStyle}>⚠ {profile.error}</div>
      ) : (
        <>
          {profile.violations.length > 0 && (
            <section style={{ marginBottom: 12 }}>
              {profile.violations.map((v, i) => (
                <div key={i} style={violationStyle}>⚠ {v.message}</div>
              ))}
            </section>
          )}
          <PiezometricSVG result={profile} width={dims.w} height={dims.h} showTemp={showTemp} />
          <ProfileSummary result={profile} />
        </>
      )}
    </div>
  );
}

interface PiezometricSVGProps {
  result: PiezometricResult;
  width: number;
  height: number;
  /** Phase 5D.3 — overlay the supply-temperature track on a secondary
   *  Y axis (right side, 60-100 °C). When false, the track is hidden
   *  even if the data is available. */
  showTemp?: boolean;
}

function PiezometricSVG({ result, width, height, showTemp = true }: PiezometricSVGProps) {
  const { points } = result;
  if (points.length < 2) return <div style={{ color: "var(--fg-muted)" }}>Хангалттай цэггүй</div>;

  // Does any point carry a supply-temperature reading? Only render
  // the temperature track when YES and the caller hasn't toggled it
  // off via showTemp.
  const hasTemp =
    showTemp && points.some((p) => typeof p.supplyTemp_C === "number");

  // Build the unified domain in (x = distance_m, y = head_m).
  const xs = points.map((p) => p.distanceFromSourceM);
  const allYs = points.flatMap((p) => [p.groundHeadM, p.supplyHeadM, p.returnHeadM, p.maxAllowedHeadM, p.minRequiredHeadM, p.staticHeadM]);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const yMin = Math.floor(Math.min(...allYs) - 5);
  const yMax = Math.ceil(Math.max(...allYs) + 5);
  // Phase 5D.3 — secondary Y-axis domain for the temperature line.
  // Fixed at 60-100 °C: the design-relevant band (БНбД 41-01 §5.4
  // minimum is 80, schedule supply is 95).
  const tMin = 60;
  const tMax = 100;
  const PAD_L = 56;
  // Slightly more right padding when the secondary axis is on, to
  // make room for the °C ticks on the right edge.
  const PAD_R = hasTemp ? 44 : 24;
  const PAD_T = 16;
  const PAD_B = 40;
  const plotW = width - PAD_L - PAD_R;
  const plotH = height - PAD_T - PAD_B;
  const xFor = (x: number) => PAD_L + ((x - xMin) / Math.max(1, xMax - xMin)) * plotW;
  const yFor = (y: number) => PAD_T + (1 - (y - yMin) / Math.max(1, yMax - yMin)) * plotH;
  /** Map a temperature in °C onto the same vertical plot area, using
   *  the secondary axis range. */
  const yForTemp = (t: number) =>
    PAD_T + (1 - (t - tMin) / Math.max(1, tMax - tMin)) * plotH;

  const polyline = (key: keyof typeof points[number]): string =>
    points.map((p, i) => `${i === 0 ? "M" : "L"} ${xFor(p.distanceFromSourceM)},${yFor(p[key] as number)}`).join(" ");

  // Ground fill — closed polygon down to bottom axis.
  const groundFill = `${polyline("groundHeadM")} L ${xFor(xMax)},${yFor(yMin)} L ${xFor(xMin)},${yFor(yMin)} Z`;

  // Y-axis ticks (every 10 m).
  const yTicks: number[] = [];
  for (let y = Math.ceil(yMin / 10) * 10; y <= yMax; y += 10) yTicks.push(y);
  // X-axis ticks (every 50 m, or fewer for short paths).
  const xStep = xMax - xMin > 400 ? 100 : 50;
  const xTicks: number[] = [];
  for (let x = 0; x <= xMax; x += xStep) xTicks.push(x);

  return (
    <svg width={width} height={height} role="img" aria-label="Piezometric profile" style={{ display: "block", background: "var(--bg)", borderRadius: 6 }}>
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

      {/* axis labels (Y left, X bottom) */}
      {yTicks.map((y) => (
        <text key={`yl${y}`} x={PAD_L - 6} y={yFor(y)} fontSize={10} textAnchor="end" alignmentBaseline="middle" fill={PALETTE.axis} fontFamily="var(--font-mono)">
          {y}
        </text>
      ))}
      {xTicks.map((x) => (
        <text key={`xl${x}`} x={xFor(x)} y={height - PAD_B + 14} fontSize={10} textAnchor="middle" fill={PALETTE.axis} fontFamily="var(--font-mono)">
          {x}м
        </text>
      ))}
      <text x={PAD_L - 36} y={PAD_T - 2} fontSize={10} fill={PALETTE.axis} fontFamily="var(--font-mono)">м</text>

      {/* 1 — Ground fill */}
      <path d={groundFill} fill={PALETTE.ground} fillOpacity={0.15} stroke="none" />
      <path d={polyline("groundHeadM")} fill="none" stroke={PALETTE.ground} strokeWidth={1.5} />

      {/* 4 — Static line (dashed) */}
      <path d={polyline("staticHeadM")} fill="none" stroke={PALETTE.staticLine} strokeWidth={1.2} strokeDasharray="6 3" />

      {/* 5 — P_max envelope */}
      <path d={polyline("maxAllowedHeadM")} fill="none" stroke={PALETTE.pMax} strokeWidth={1.2} strokeDasharray="4 2" opacity={0.7} />
      {/* 6 — P_min envelope */}
      <path d={polyline("minRequiredHeadM")} fill="none" stroke={PALETTE.pMin} strokeWidth={1.2} strokeDasharray="4 2" opacity={0.7} />

      {/* 2 — Supply line */}
      <path d={polyline("supplyHeadM")} fill="none" stroke={PALETTE.supply} strokeWidth={2.5} />
      {/* 3 — Return line */}
      <path d={polyline("returnHeadM")} fill="none" stroke={PALETTE.ret} strokeWidth={2.5} />

      {/* 8 — Phase 5D.3: supply-temperature overlay (secondary Y axis) */}
      {hasTemp && (
        <>
          {/* Secondary Y-axis (right edge) + ticks. */}
          <line
            x1={width - PAD_R}
            y1={PAD_T}
            x2={width - PAD_R}
            y2={height - PAD_B}
            stroke={PALETTE.supplyTemp}
            strokeWidth={1}
            opacity={0.6}
          />
          {[60, 70, 80, 90, 100].map((t) => (
            <g key={`tt${t}`}>
              <line
                x1={width - PAD_R}
                y1={yForTemp(t)}
                x2={width - PAD_R + 4}
                y2={yForTemp(t)}
                stroke={PALETTE.supplyTemp}
                strokeWidth={1}
              />
              <text
                x={width - PAD_R + 6}
                y={yForTemp(t)}
                fontSize={10}
                alignmentBaseline="middle"
                fill={PALETTE.supplyTemp}
                fontFamily="var(--font-mono)"
              >
                {t}°
              </text>
            </g>
          ))}
          {/* Temp polyline (gaps where supplyTemp_C is undefined). */}
          <path
            d={points
              .map((p, i) => {
                if (typeof p.supplyTemp_C !== "number") return "";
                const cmd = i === 0 ? "M" : "L";
                return `${cmd} ${xFor(p.distanceFromSourceM)},${yForTemp(p.supplyTemp_C)}`;
              })
              .filter(Boolean)
              .join(" ")}
            fill="none"
            stroke={PALETTE.supplyTemp}
            strokeWidth={2}
            strokeDasharray="6 2"
          />
          {/* Point markers on the temp line. */}
          {points.map((p) =>
            typeof p.supplyTemp_C === "number" ? (
              <circle
                key={`tdot-${p.nodeId}`}
                cx={xFor(p.distanceFromSourceM)}
                cy={yForTemp(p.supplyTemp_C)}
                r={2.5}
                fill={PALETTE.supplyTemp}
              />
            ) : null,
          )}
        </>
      )}

      {/* 7 — Building markers at each consumer (vertical bar from ground to ground+building) */}
      {points.map((p) => {
        const bldgH = p.minRequiredHeadM - p.groundHeadM; // includes airGap
        if (bldgH < 2) return null;
        return (
          <rect
            key={`bldg-${p.nodeId}`}
            x={xFor(p.distanceFromSourceM) - 3}
            y={yFor(p.groundHeadM + bldgH)}
            width={6}
            height={Math.max(0, yFor(p.groundHeadM) - yFor(p.groundHeadM + bldgH))}
            fill={PALETTE.bldg}
            stroke={PALETTE.ground}
            strokeWidth={0.5}
          />
        );
      })}

      {/* Node labels above each point */}
      {points.map((p, i) => (
        <text key={`lbl-${p.nodeId}-${i}`} x={xFor(p.distanceFromSourceM)} y={PAD_T + 10} fontSize={10} textAnchor="middle" fill="var(--fg)" fontFamily="var(--font-mono)" fontWeight={600}>
          {p.nodeLabel}
        </text>
      ))}

      {/* Legend (compact, top-right of plot area, shifted inward when
          the temp axis is present) */}
      <g transform={`translate(${width - PAD_R - 110}, ${PAD_T + 22})`}>
        <LegendItem y={0} color={PALETTE.supply} label="Supply" />
        <LegendItem y={12} color={PALETTE.ret} label="Return" />
        <LegendItem y={24} color={PALETTE.ground} label="Газар" />
        <LegendItem y={36} color={PALETTE.staticLine} label="Статик" dashed />
        {hasTemp && (
          <LegendItem y={48} color={PALETTE.supplyTemp} label="T° (°C)" dashed />
        )}
      </g>
    </svg>
  );
}

function LegendItem({ y, color, label, dashed }: { y: number; color: string; label: string; dashed?: boolean }) {
  return (
    <g transform={`translate(0, ${y})`}>
      <line x1={0} y1={0} x2={18} y2={0} stroke={color} strokeWidth={2} strokeDasharray={dashed ? "3 2" : undefined} />
      <text x={24} y={3} fontSize={10} fill="var(--fg-muted)" fontFamily="var(--font-mono)">{label}</text>
    </g>
  );
}

function ProfileSummary({ result }: { result: PiezometricResult }) {
  const last = result.points[result.points.length - 1]!;
  const source = result.points[0]!;
  return (
    <div style={summaryStyle}>
      <span><b>Зам</b>: {source.nodeLabel} → {last.nodeLabel}</span>
      <span><b>Урт</b>: {last.distanceFromSourceM.toFixed(0)}м</span>
      <span><b>Σ алдагдал</b>: {result.totalFrictionHeadM.toFixed(1)}м</span>
      <span><b>ΔP last</b>: {last.availableDPM.toFixed(1)}м {last.availableDPM >= 15 ? "✓" : "⚠"}</span>
      <span><b>Зөрчил</b>: {result.violations.length}</span>
    </div>
  );
}

function NumberField({ label, value, onChange, min, max }: { label: string; value: number; onChange: (v: number) => void; min: number; max: number }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11, color: "var(--fg-muted)" }}>
      {label}
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ padding: "0.3rem 0.4rem", fontSize: 12, background: "var(--bg)", color: "var(--fg)", border: "1px solid var(--border)", borderRadius: 4, fontFamily: "var(--font-mono)", width: 84 }}
      />
    </label>
  );
}

function SelectPN({ value, onChange }: { value: 10 | 16 | 25; onChange: (v: 10 | 16 | 25) => void }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11, color: "var(--fg-muted)" }}>
      PN (bar)
      <select value={value} onChange={(e) => onChange(Number(e.target.value) as 10 | 16 | 25)} style={{ padding: "0.3rem 0.4rem", fontSize: 12, background: "var(--bg)", color: "var(--fg)", border: "1px solid var(--border)", borderRadius: 4, fontFamily: "var(--font-mono)", width: 84 }}>
        <option value={10}>PN 10</option>
        <option value={16}>PN 16</option>
        <option value={25}>PN 25</option>
      </select>
    </label>
  );
}

const containerStyle: CSSProperties = { padding: "1.25rem", overflowY: "auto", height: "100%" };
const controlsStyle: CSSProperties = { display: "flex", gap: 12, marginBottom: 14, flexWrap: "wrap" };
const violationStyle: CSSProperties = { padding: "0.5rem 0.75rem", marginBottom: 6, borderRadius: 6, background: "rgba(226,75,74,0.1)", border: "1px solid var(--danger)", fontSize: 12, color: "var(--danger)" };
const errorStyle: CSSProperties = { padding: "1rem", borderRadius: 6, background: "rgba(215,165,74,0.1)", border: "1px solid var(--warning)", color: "var(--warning)", fontSize: 13 };
const summaryStyle: CSSProperties = { display: "flex", gap: 20, padding: "0.5rem 0.75rem", marginTop: 10, borderRadius: 6, background: "var(--bg-soft)", fontSize: 12, color: "var(--fg-muted)", flexWrap: "wrap" };
