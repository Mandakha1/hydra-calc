/**
 * Piezometric chart — pressure-vs-distance plot for the critical path.
 * Shows: supply line, return line, static head, building elevation profile.
 *
 * Walks from source to the deepest consumer (longest cumulative ΔP path) and plots:
 *   - X: cumulative distance (m)
 *   - Y: pressure head (m water column or MPa)
 */
import { useMemo, type CSSProperties, type ReactNode } from "react";
import { useHydraulicStore } from "../hydraulicStore";

const GRAVITY = 9.81;
const RHO = 970;

export function PiezometricChart() {
  const nodes = useHydraulicStore((s) => s.nodes);
  const pipes = useHydraulicStore((s) => s.pipes);
  const results = useHydraulicStore((s) => s.results);
  const settings = useHydraulicStore((s) => s.settings);

  const path = useMemo(() => buildCriticalPath(nodes, pipes, results), [nodes, pipes, results]);

  if (!results) {
    return (
      <div style={{ padding: "2rem", color: "var(--fg-muted)", textAlign: "center" }}>
        Тооцоолол хийгдээгүй. Эхлээд "⚙ Тооцоолох" товч дарна уу.
      </div>
    );
  }
  if (path.length < 2) {
    return (
      <div style={{ padding: "2rem", color: "var(--fg-muted)", textAlign: "center" }}>
        Пьезометрийн график зурахад хамгийн багадаа Эх үүсвэр + Хэрэглэгч хэрэгтэй.
      </div>
    );
  }

  // Convert MPa → m water column for human-readable Y axis
  const toMeters = (mpa: number) => (mpa * 1e6) / (RHO * GRAVITY);

  const supply = path.map((p) => ({ x: p.cumLength_m, y: toMeters(p.supply_mpa), node: p.nodeLabel }));
  const ret = path.map((p) => ({ x: p.cumLength_m, y: toMeters(p.return_mpa), node: p.nodeLabel }));
  const elev = path.map((p) => ({ x: p.cumLength_m, y: p.elevation_m, node: p.nodeLabel }));
  const staticHead = settings.sourcePressure_mpa * 0.5; // approximate static line at 0.3 MPa
  const staticY = toMeters(staticHead);

  const maxX = path[path.length - 1]!.cumLength_m;
  const allY = [...supply, ...ret, ...elev].map((p) => p.y);
  const minY = Math.min(0, ...allY) - 5;
  const maxY = Math.max(...allY, staticY) + 5;

  const width = 920;
  const height = 480;
  const margin = { top: 40, right: 60, bottom: 60, left: 70 };

  const xScale = (x: number) => margin.left + (x / Math.max(maxX, 1)) * (width - margin.left - margin.right);
  const yScale = (y: number) => height - margin.bottom - ((y - minY) / (maxY - minY)) * (height - margin.top - margin.bottom);

  const linePath = (data: typeof supply) =>
    data.map((p, i) => `${i === 0 ? "M" : "L"} ${xScale(p.x).toFixed(1)} ${yScale(p.y).toFixed(1)}`).join(" ");

  // X axis ticks every ~100m (rounded)
  const xStep = niceStep(maxX, 6);
  const xTicks: number[] = [];
  for (let x = 0; x <= maxX + 0.01; x += xStep) xTicks.push(x);

  const yStep = niceStep(maxY - minY, 6);
  const yTicks: number[] = [];
  for (let y = Math.ceil(minY / yStep) * yStep; y <= maxY; y += yStep) yTicks.push(y);

  return (
    <div style={{ padding: "1rem", overflowX: "auto" }}>
      <div style={{ marginBottom: "1rem" }}>
        <h3 style={{ margin: 0 }}>Пьезометрийн график</h3>
        <p style={{ margin: "0.25rem 0", fontSize: 13, color: "var(--fg-muted)" }}>
          Хамгийн уртын зам: {path[0]!.nodeLabel} → {path[path.length - 1]!.nodeLabel} ({maxX.toFixed(1)} м)
        </p>
      </div>

      <svg width={width} height={height} style={{ background: "var(--bg-soft)", borderRadius: 8, border: "1px solid var(--border-soft)" }}>
        {/* Grid */}
        <g stroke="var(--border-soft)" strokeWidth="0.5" strokeDasharray="2 2">
          {xTicks.map((x) => (
            <line key={`gx${x}`} x1={xScale(x)} y1={margin.top} x2={xScale(x)} y2={height - margin.bottom} />
          ))}
          {yTicks.map((y) => (
            <line key={`gy${y}`} x1={margin.left} y1={yScale(y)} x2={width - margin.right} y2={yScale(y)} />
          ))}
        </g>

        {/* Axes */}
        <g stroke="var(--border)" strokeWidth="1.5">
          <line x1={margin.left} y1={margin.top} x2={margin.left} y2={height - margin.bottom} />
          <line x1={margin.left} y1={height - margin.bottom} x2={width - margin.right} y2={height - margin.bottom} />
        </g>

        {/* Y-axis labels */}
        <g fontSize="11" fill="var(--fg-muted)" fontFamily="var(--font-mono)" textAnchor="end">
          {yTicks.map((y) => (
            <text key={`yl${y}`} x={margin.left - 6} y={yScale(y) + 4}>{y.toFixed(0)}</text>
          ))}
          <text x={20} y={margin.top - 12} textAnchor="start" fill="var(--fg)">H, м.в.с.</text>
        </g>

        {/* X-axis labels */}
        <g fontSize="11" fill="var(--fg-muted)" fontFamily="var(--font-mono)" textAnchor="middle">
          {xTicks.map((x) => (
            <text key={`xl${x}`} x={xScale(x)} y={height - margin.bottom + 18}>{x.toFixed(0)}</text>
          ))}
          <text x={width - margin.right} y={height - margin.bottom + 38} textAnchor="end" fill="var(--fg)">L, м</text>
        </g>

        {/* === Zulu 21-curve standard piezometric template === */}

        {/* Building height bars (Hzdan from imported data) — vertical at each consumer */}
        {path.map((p) => {
          const node = nodes.find((nn) => nn.id === p.nodeId);
          const hz = node?.hzdan ?? node?.buildingHeight_m;
          if (!hz || hz < 1) return null;
          const baseY = yScale(p.elevation_m);
          const topY = yScale(p.elevation_m + hz);
          return (
            <rect
              key={`bld-${p.nodeId}`}
              x={xScale(p.cumLength_m) - 4}
              y={topY}
              width={8}
              height={baseY - topY}
              fill="rgba(31, 95, 170, 0.18)"
              stroke="var(--bp-blue)"
              strokeWidth="0.8"
            />
          );
        })}

        {/* Min required head at consumer line (0.15 MPa = 15.3m above geo-profile) */}
        <path
          d={linePath(elev.map((e, i) => ({ x: e.x, y: e.y + 15.3, node: path[i]!.nodeLabel })))}
          stroke="var(--bp-amber)"
          strokeWidth="1.5"
          strokeDasharray="3 3"
          fill="none"
        />

        {/* Max allowed head (90m typical safety limit per БНбД 41-01) */}
        {maxY > 80 && (
          <line
            x1={xScale(0)}
            y1={yScale(90)}
            x2={xScale(maxX)}
            y2={yScale(90)}
            stroke="var(--bp-red)"
            strokeWidth="1"
            strokeDasharray="6 3"
            opacity="0.6"
          />
        )}

        {/* Static head line */}
        <line
          x1={xScale(0)}
          y1={yScale(staticY)}
          x2={xScale(maxX)}
          y2={yScale(staticY)}
          stroke="var(--fg-dim)"
          strokeDasharray="4 4"
          strokeWidth="1.5"
        />
        <text x={xScale(maxX) - 6} y={yScale(staticY) - 4} fontSize="10" fill="var(--fg-dim)" textAnchor="end" fontFamily="var(--font-mono)">
          Статик ({staticY.toFixed(0)}м)
        </text>

        {/* Elevation profile (filled — geo) */}
        <path
          d={`${linePath(elev)} L ${xScale(maxX).toFixed(1)} ${yScale(minY).toFixed(1)} L ${xScale(0).toFixed(1)} ${yScale(minY).toFixed(1)} Z`}
          fill="rgba(91, 107, 124, 0.15)"
          stroke="var(--fg-dim)"
          strokeWidth="1.2"
        />

        {/* Available head shading between supply & return */}
        <path
          d={`${linePath(supply)} L ${xScale(ret[ret.length - 1]!.x).toFixed(1)} ${yScale(ret[ret.length - 1]!.y).toFixed(1)} ${ret.slice().reverse().map((p) => `L ${xScale(p.x).toFixed(1)} ${yScale(p.y).toFixed(1)}`).join(" ")} Z`}
          fill="rgba(176, 57, 46, 0.06)"
        />

        {/* Supply line (T1) */}
        <path d={linePath(supply)} stroke="var(--bp-supply)" strokeWidth="2.5" fill="none" />
        {/* Return line (T2) */}
        <path d={linePath(ret)} stroke="var(--bp-return)" strokeWidth="2.5" fill="none" />

        {/* Node markers */}
        {path.map((p) => (
          <g key={p.nodeId} transform={`translate(${xScale(p.cumLength_m)}, 0)`}>
            <line
              y1={yScale(toMeters(p.return_mpa))}
              y2={yScale(toMeters(p.supply_mpa))}
              stroke="var(--border)"
              strokeWidth="1"
              strokeDasharray="2 2"
            />
            <circle cx={0} cy={yScale(toMeters(p.supply_mpa))} r={4} fill="var(--danger)" />
            <circle cx={0} cy={yScale(toMeters(p.return_mpa))} r={4} fill="var(--accent)" />
            <text
              y={height - margin.bottom + 18}
              fontSize="10"
              fill="var(--fg)"
              textAnchor="middle"
              fontFamily="var(--font-mono)"
              transform={`translate(0, 18)`}
            >
              {p.nodeLabel}
            </text>
          </g>
        ))}

        {/* Legend — 7 curves (Zulu-style) */}
        <g transform={`translate(${margin.left + 12}, ${margin.top + 10})`} fontSize="11" fontFamily="var(--font-mono)">
          <rect x={-6} y={-12} width={210} height={130} fill="var(--bg-elev)" stroke="var(--border-soft)" rx={4} />
          <line x1={0} y1={0} x2={20} y2={0} stroke="var(--bp-supply)" strokeWidth="2.5" />
          <text x={26} y={4} fill="var(--fg)">Нийлүүлэх (Т1)</text>
          <line x1={0} y1={16} x2={20} y2={16} stroke="var(--bp-return)" strokeWidth="2.5" />
          <text x={26} y={20} fill="var(--fg)">Буцах (Т2)</text>
          <line x1={0} y1={32} x2={20} y2={32} stroke="var(--bp-amber)" strokeDasharray="3 3" strokeWidth="1.5" />
          <text x={26} y={36} fill="var(--fg)">Шаардл. min Δp</text>
          <line x1={0} y1={48} x2={20} y2={48} stroke="var(--bp-red)" strokeDasharray="6 3" strokeWidth="1" />
          <text x={26} y={52} fill="var(--fg)">Зөвш. max H (90м)</text>
          <line x1={0} y1={64} x2={20} y2={64} stroke="var(--fg-dim)" strokeDasharray="4 4" strokeWidth="1.5" />
          <text x={26} y={68} fill="var(--fg)">Статик даралт</text>
          <rect x={0} y={76} width={20} height={12} fill="rgba(91, 107, 124, 0.15)" stroke="var(--fg-dim)" strokeWidth="0.8" />
          <text x={26} y={86} fill="var(--fg)">Газрын өндөржилт</text>
          <rect x={0} y={92} width={20} height={12} fill="rgba(31, 95, 170, 0.18)" stroke="var(--bp-blue)" strokeWidth="0.8" />
          <text x={26} y={102} fill="var(--fg)">Барилгын өндөр</text>
        </g>
      </svg>

      {/* Table view */}
      <table style={tableStyle}>
        <thead>
          <tr>
            <Th>Зангилаа</Th>
            <Th>L (м)</Th>
            <Th>Нийлүүлэх (м.в.с.)</Th>
            <Th>Буцах (м.в.с.)</Th>
            <Th>Available H (м)</Th>
          </tr>
        </thead>
        <tbody>
          {path.map((p) => (
            <tr key={p.nodeId}>
              <Td>{p.nodeLabel}</Td>
              <Td>{p.cumLength_m.toFixed(1)}</Td>
              <Td>{toMeters(p.supply_mpa).toFixed(2)}</Td>
              <Td>{toMeters(p.return_mpa).toFixed(2)}</Td>
              <Td>{(toMeters(p.supply_mpa) - toMeters(p.return_mpa)).toFixed(2)}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface PathPoint {
  nodeId: string;
  nodeLabel: string;
  cumLength_m: number;
  supply_mpa: number;
  return_mpa: number;
  elevation_m: number;
}

/** Walk from source to the consumer with maximum cumulative ΔP. */
function buildCriticalPath(
  nodes: ReturnType<typeof useHydraulicStore.getState>["nodes"],
  pipes: ReturnType<typeof useHydraulicStore.getState>["pipes"],
  results: ReturnType<typeof useHydraulicStore.getState>["results"],
): PathPoint[] {
  if (!results) return [];

  const sourceId = nodes.find((n) => n.kind === "source")?.id ?? nodes[0]?.id;
  if (!sourceId) return [];

  const adj = new Map<string, typeof pipes>();
  for (const p of pipes) {
    if (!adj.has(p.fromNodeId)) adj.set(p.fromNodeId, []);
    adj.get(p.fromNodeId)!.push(p);
  }
  const resultByPipe = new Map(results.pipes.map((r) => [r.pipeId, r]));

  // BFS to find longest cumulative-ΔP path
  let bestPath: PathPoint[] = [];
  let bestDpSum = 0;

  function dfs(nodeId: string, cumLength: number, supplyP: number, path: PathPoint[]) {
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return;
    const result = results!.nodes.find((r) => r.nodeId === nodeId);
    const supply_mpa = result?.pressureAtNode_mpa ?? supplyP;
    const return_mpa = supply_mpa - 0.15; // approx — assume 0.15 MPa available at consumer
    const point: PathPoint = {
      nodeId,
      nodeLabel: node.label,
      cumLength_m: cumLength,
      supply_mpa,
      return_mpa,
      elevation_m: node.elevation_m ?? 0,
    };
    const newPath = [...path, point];

    const children = adj.get(nodeId) ?? [];
    if (children.length === 0 || node.kind === "consumer") {
      // Terminal or consumer
      const totalDp = newPath[0]!.supply_mpa - point.supply_mpa;
      if (totalDp >= bestDpSum) {
        bestDpSum = totalDp;
        bestPath = newPath;
      }
      if (children.length === 0) return;
    }
    for (const pipe of children) {
      dfs(pipe.toNodeId, cumLength + pipe.length_m, supplyP, newPath);
    }
  }

  dfs(sourceId, 0, results.nodes.find((n) => n.nodeId === sourceId)?.pressureAtNode_mpa ?? 0.6, []);
  return bestPath;
}

function niceStep(range: number, targetTicks: number): number {
  const raw = range / Math.max(targetTicks, 1);
  const pow = Math.pow(10, Math.floor(Math.log10(Math.max(raw, 1e-9))));
  const norm = raw / pow;
  if (norm < 1.5) return pow;
  if (norm < 3.5) return 2 * pow;
  if (norm < 7.5) return 5 * pow;
  return 10 * pow;
}

const tableStyle: CSSProperties = {
  width: "100%",
  marginTop: "1rem",
  borderCollapse: "collapse",
  fontSize: 13,
  fontFamily: "var(--font-mono)",
};

function Th({ children }: { children: ReactNode }) {
  return (
    <th style={{ padding: "0.4rem 0.6rem", textAlign: "left", borderBottom: "1px solid var(--border)", color: "var(--fg-muted)", fontWeight: 600, fontSize: 12, textTransform: "uppercase" }}>
      {children}
    </th>
  );
}
function Td({ children }: { children: ReactNode }) {
  return (
    <td style={{ padding: "0.35rem 0.6rem", borderBottom: "1px solid var(--border-soft)", color: "var(--fg)" }}>
      {children}
    </td>
  );
}
