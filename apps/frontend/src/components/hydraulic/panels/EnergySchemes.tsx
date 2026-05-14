/**
 * Phase 8.2 — Energy schemes view (read-only).
 *
 * "Энергийн схем" sheet from the standard Mongolian district-heating
 * drawing set. Renders a Sankey-lite heat-balance diagram (Source
 * → Distribution losses → Consumers) plus per-consumer + per-
 * circuit breakdown tables. No new data-model fields — every
 * number lives on `CalculationResults` per the Phase 8 exploration
 * report verdict.
 *
 * Standards followed:
 *   - БНбД 41-01-2019 §5  — heat-load summation
 *   - БНбД 41-01-2019 §5.4 — minimum supply temperature 80 °C
 *   - СП 124.13330.2012 §6 — distribution loss accounting
 *   - ГОСТ 21.605 (Энергийн схем) — drawing sheet terminology
 *
 * Empty / error states (mirroring Phase 8.1 pattern):
 *   - No results yet → banner pointing the engineer to ⚙ Тооцоолох.
 *   - Heat-loss disabled in settings → distribution column collapses
 *     to 0 + advisory note pointing at the Тохиргоо tab.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useHydraulicStore } from "../hydraulicStore";
import {
  buildEnergyScheme,
  circuitLabel,
  consumerKindLabel,
  type EnergyError,
  type EnergyScheme,
} from "../scheme/energyScheme";

const PALETTE = {
  source: "#A32D2D",
  losses: "#BA7517",
  consumers: "#1F5FAA",
  axis: "var(--fg-muted)",
  okBadge: "var(--success)",
  warnBadge: "var(--warning)",
  errBadge: "var(--danger)",
};

export function EnergySchemes() {
  const nodes = useHydraulicStore((s) => s.nodes);
  const pipes = useHydraulicStore((s) => s.pipes);
  const results = useHydraulicStore((s) => s.results);

  const view = useMemo<EnergyScheme | EnergyError>(
    () => buildEnergyScheme(nodes, pipes, results),
    [nodes, pipes, results],
  );

  // ResizeObserver-driven width — same Phase 8.1 pattern.
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
    <div ref={containerRef} style={containerStyle} data-testid="energy-schemes">
      <header style={{ marginBottom: 12 }}>
        <h3 style={{ margin: 0 }}>⚡ Энергийн схем</h3>
        <p style={{ margin: "0.25rem 0", fontSize: 13, color: "var(--fg-muted)" }}>
          Эх үүсвэр → Тархалтын алдагдал → Хэрэглэгчдийн ачаалал. БНбД 41-01
          §5 + ГОСТ 21.605-н дагуу дулааны тэнцвэр.
        </p>
      </header>

      {"error" in view ? (
        <div style={errorBanner} data-testid="energy-error">{view.error}</div>
      ) : (
        <>
          <BalanceBar width={width} balance={view.balance} />
          <BalanceSummary balance={view.balance} />
          <CircuitBreakdown rows={view.circuitLosses} />
          <ConsumerTable rows={view.consumers} />
        </>
      )}
    </div>
  );
}

/* ─── Sankey-lite balance bar ─────────────────────────────────── */

function BalanceBar({
  width,
  balance,
}: {
  width: number;
  balance: EnergyScheme["balance"];
}) {
  const total = balance.sourceOutput_kw;
  if (total <= 0) {
    return (
      <div style={errorBanner} data-testid="energy-zero-output">
        Эх үүсвэрийн нийт гарц = 0 кВт. Хэрэглэгчдийн дулааны ачаалал (heatLoad_w)
        болон тооцооны үр дүнд хэт алдагдал байхгүй учир тэнцвэр харагдахгүй.
      </div>
    );
  }
  // Horizontal split bar: consumers (left) + losses (right). The
  // visual proportion matches the engineering intent — "this much
  // useful load, this much wasted into the soil".
  const consumerFrac = 1 - balance.lossFraction;
  const consumerW = Math.max(40, consumerFrac * (width - 40));
  const lossW = Math.max(0, balance.lossFraction * (width - 40));
  return (
    <div style={{ marginBottom: 14 }} data-testid="energy-balance-bar">
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, fontSize: 12, color: "var(--fg-muted)" }}>
        <span>Эх үүсвэр: <b style={{ color: PALETTE.source }}>{total.toFixed(1)} кВт</b></span>
        <span>=</span>
        <span>Хэрэглэгчид: <b style={{ color: PALETTE.consumers }}>{balance.totalConsumerLoad_kw.toFixed(1)} кВт</b></span>
        <span>+</span>
        <span>Алдагдал: <b style={{ color: PALETTE.losses }}>{balance.totalDistributionLoss_kw.toFixed(1)} кВт</b> ({(balance.lossFraction * 100).toFixed(1)}%)</span>
      </div>
      <svg width={width} height={32} role="img" aria-label="Heat balance bar" data-testid="energy-balance-svg">
        <rect x={0} y={6} width={consumerW} height={20} fill={PALETTE.consumers} rx={4} />
        <rect x={consumerW + 2} y={6} width={lossW} height={20} fill={PALETTE.losses} rx={4} />
        <text x={consumerW / 2} y={20} fontSize={11} fill="#fff" textAnchor="middle" fontWeight={600}>
          {balance.totalConsumerLoad_kw.toFixed(0)} кВт
        </text>
        {lossW > 30 && (
          <text x={consumerW + 2 + lossW / 2} y={20} fontSize={11} fill="#fff" textAnchor="middle" fontWeight={600}>
            {balance.totalDistributionLoss_kw.toFixed(0)} кВт
          </text>
        )}
      </svg>
    </div>
  );
}

/* ─── Stats summary boxes ─────────────────────────────────────── */

function BalanceSummary({ balance }: { balance: EnergyScheme["balance"] }) {
  return (
    <div style={summaryGrid} data-testid="energy-summary">
      <StatBox label="Эх үүсвэрийн гарц" value={`${balance.sourceOutput_kw.toFixed(1)} кВт`} color={PALETTE.source} />
      <StatBox label="Хэрэглэгчдийн ачаалал" value={`${balance.totalConsumerLoad_kw.toFixed(1)} кВт`} color={PALETTE.consumers} />
      <StatBox label="Тархалтын алдагдал" value={`${balance.totalDistributionLoss_kw.toFixed(1)} кВт (${(balance.lossFraction * 100).toFixed(1)}%)`} color={PALETTE.losses} />
      {typeof balance.pumpPower_kw === "number" && (
        <StatBox label="Насосын чадал" value={`${balance.pumpPower_kw.toFixed(2)} кВт`} color="var(--fg)" />
      )}
      {typeof balance.sourceSupplyTemp_C === "number" && (
        <StatBox
          label="T₁ (эх үүсвэр)"
          value={`${balance.sourceSupplyTemp_C.toFixed(1)} °C`}
          color="var(--fg)"
        />
      )}
      {typeof balance.minConsumerSupplyTemp_C === "number" && (
        <StatBox
          label="T₁ мин (хэрэглэгч)"
          value={`${balance.minConsumerSupplyTemp_C.toFixed(1)} °C`}
          color={balance.meetsMinSupplyTemp ? PALETTE.okBadge : PALETTE.errBadge}
          badge={balance.meetsMinSupplyTemp ? "✓ ≥80" : "⚠ <80 БНбД 41-01 §5.4"}
        />
      )}
    </div>
  );
}

function StatBox({
  label,
  value,
  color,
  badge,
}: {
  label: string;
  value: string;
  color: string;
  badge?: string;
}) {
  return (
    <div style={statBoxStyle}>
      <span style={{ fontSize: 11, color: "var(--fg-muted)" }}>{label}</span>
      <span style={{ fontSize: 14, fontFamily: "var(--font-mono)", fontWeight: 600, color }}>{value}</span>
      {badge && (
        <span style={{ fontSize: 10, color, fontWeight: 600 }}>{badge}</span>
      )}
    </div>
  );
}

/* ─── Circuit breakdown table ─────────────────────────────────── */

function CircuitBreakdown({ rows }: { rows: EnergyScheme["circuitLosses"] }) {
  if (rows.length === 0) {
    return (
      <div style={emptySubsection} data-testid="energy-no-circuits">
        Тооцоонд хоолой ороогүй — алдагдал тооцоологдоогүй байна.
      </div>
    );
  }
  return (
    <div style={subsectionStyle} data-testid="energy-circuits">
      <h4 style={subsectionHeading}>Хоолойн алдагдал контурвар</h4>
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={thStyle}>Контур</th>
            <th style={thNumStyle}>Урт (м)</th>
            <th style={thNumStyle}>Дундаж q&prime; (Вт/м)</th>
            <th style={thNumStyle}>Алдагдал (кВт)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.circuit}>
              <td style={tdStyle}>{circuitLabel(r.circuit)}</td>
              <td style={tdNumStyle}>{r.totalLength_m.toFixed(0)}</td>
              <td style={tdNumStyle}>{r.avgLossPerMeter_W.toFixed(1)}</td>
              <td style={tdNumStyle}>{(r.loss_w / 1000).toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ─── Consumer load table ─────────────────────────────────────── */

function ConsumerTable({ rows }: { rows: EnergyScheme["consumers"] }) {
  if (rows.length === 0) {
    return (
      <div style={emptySubsection} data-testid="energy-no-consumers">
        Тооцоонд хэрэглэгч ороогүй — ачааллын хүснэгт алга.
      </div>
    );
  }
  return (
    <div style={subsectionStyle} data-testid="energy-consumers">
      <h4 style={subsectionHeading}>Хэрэглэгчийн ачаалал</h4>
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={thStyle}>Нэр</th>
            <th style={thStyle}>Төрөл</th>
            <th style={thNumStyle}>Ачаалал (кВт)</th>
            <th style={thNumStyle}>Хувь</th>
            <th style={thNumStyle}>T₁ (°C)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.nodeId}>
              <td style={tdStyle}>{r.label}</td>
              <td style={tdStyle}>{consumerKindLabel(r.kind)}</td>
              <td style={tdNumStyle}>{r.load_kw.toFixed(1)}</td>
              <td style={tdNumStyle}>{(r.fractionOfTotal * 100).toFixed(1)}%</td>
              <td
                style={{
                  ...tdNumStyle,
                  color:
                    typeof r.supplyTemp_C === "number" && r.supplyTemp_C < 80
                      ? PALETTE.errBadge
                      : tdNumStyle.color,
                }}
              >
                {typeof r.supplyTemp_C === "number" ? r.supplyTemp_C.toFixed(1) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ─── Styles ──────────────────────────────────────────────────── */

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
  marginBottom: 14,
};

const statBoxStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 2,
  padding: "6px 10px",
  background: "var(--bg-elev)",
  border: "1px solid var(--border-soft)",
  borderRadius: 6,
  minWidth: 130,
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
  marginBottom: 12,
};

const emptySubsection: CSSProperties = {
  ...errorBanner,
  marginBottom: 14,
};
