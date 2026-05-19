import type { CSSProperties, ReactNode } from "react";
import { useHydraulicStore } from "../hydraulicStore";
import { PIPE_MATERIALS } from "shared";

export function ResultsPanel() {
  const results = useHydraulicStore((s) => s.results);
  const violations = useHydraulicStore((s) => s.violations);
  const nodes = useHydraulicStore((s) => s.nodes);
  const pipes = useHydraulicStore((s) => s.pipes);

  if (!results) {
    return (
      <div style={{ padding: "2rem", color: "var(--fg-muted)", textAlign: "center" }}>
        Тооцоолол хийгдээгүй байна. &quot;Тооцоолох&quot; товч дарна уу.
      </div>
    );
  }

  return (
    <div style={{ padding: "1.25rem", overflowY: "auto", height: "100%" }}>
      {violations && violations.length > 0 && (
        <section style={{ marginBottom: "1.5rem" }}>
          <h3>Норм зөрчил ({violations.length})</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {violations.map((v, i) => (
              <div
                key={i}
                style={{
                  padding: "0.5rem 0.75rem",
                  borderRadius: 6,
                  background: v.severity === "error" ? "rgba(226,107,107,0.1)" : "rgba(215,165,74,0.1)",
                  border: `1px solid ${v.severity === "error" ? "var(--danger)" : "var(--warning)"}`,
                  fontSize: 13,
                }}
              >
                <b style={{ color: v.severity === "error" ? "var(--danger)" : "var(--warning)" }}>
                  {v.severity === "error" ? "⚠" : "!"}
                </b>{" "}
                {v.message}
              </div>
            ))}
          </div>
        </section>
      )}

      <section style={{ marginBottom: "1.5rem" }}>
        <h3>Хоолойн үр дүн</h3>
        <div style={{ overflowX: "auto" }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <Th>№</Th>
                <Th>Материал</Th>
                <Th>DN</Th>
                <Th>L (м)</Th>
                <Th>G (кг/с)</Th>
                <Th>v (м/с)</Th>
                <Th>Re</Th>
                <Th>λ</Th>
                <Th>R (Pa/м)</Th>
                <Th>ΔP (кПа)</Th>
              </tr>
            </thead>
            <tbody>
              {results.pipes.map((r, i) => {
                const p = pipes.find((x) => x.id === r.pipeId);
                const mat = PIPE_MATERIALS.find((m) => m.key === p?.materialKey)?.name.split(" ")[0] ?? "";
                return (
                  <tr key={r.pipeId}>
                    <Td>{i + 1}</Td>
                    <Td>{mat}</Td>
                    <Td>{p?.dn}</Td>
                    <Td>{p?.length_m != null ? p.length_m.toFixed(1) : ""}</Td>
                    <Td>{r.G_kg_s.toFixed(3)}</Td>
                    <Td red={r.v_m_s > 3.5}>{r.v_m_s.toFixed(3)}</Td>
                    <Td>{r.Re.toFixed(0)}</Td>
                    <Td>{r.lambda.toFixed(4)}</Td>
                    <Td red={r.headlossPerMeter_pa > 80}>{r.headlossPerMeter_pa.toFixed(1)}</Td>
                    <Td>{(r.totalPressureDrop_pa / 1000).toFixed(2)}</Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section style={{ marginBottom: "1.5rem" }}>
        <h3>Зангилаа</h3>
        <div style={{ overflowX: "auto" }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <Th>№</Th>
                <Th>Нэр</Th>
                <Th>Төрөл</Th>
                <Th>Ачаалал (кВт)</Th>
                <Th>Даралт (MPa)</Th>
              </tr>
            </thead>
            <tbody>
              {results.nodes.map((r, i) => {
                const n = nodes.find((x) => x.id === r.nodeId);
                return (
                  <tr key={r.nodeId}>
                    <Td>{i + 1}</Td>
                    <Td>{n?.label}</Td>
                    <Td>{n?.kind}</Td>
                    <Td>{(r.heatLoad_w / 1000).toFixed(2)}</Td>
                    <Td red={n?.kind === "consumer" && r.pressureAtNode_mpa < 0.15}>
                      {r.pressureAtNode_mpa.toFixed(3)}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {results.pump && (
        <section>
          <h3>Насосын тооцоо</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
            <Stat label="Напор H (минимум)" value={`${results.pump.H_m.toFixed(2)} м`} />
            <Stat label="Дебит Q" value={`${results.pump.Q_m3h.toFixed(2)} м³/ц`} />
            <Stat label="Чадал P" value={`${results.pump.P_kW.toFixed(2)} кВт`} />
            {results.pump.breakdown && (
              <Stat
                label="Зөвлөсөн H (+нөөц)"
                value={`${(
                  results.pump.H_m + results.pump.breakdown.safetyMargin_m
                ).toFixed(2)} м`}
              />
            )}
          </div>

          {results.pump.breakdown && (
            <div
              style={{
                marginTop: 12,
                background: "var(--bg-card)",
                border: "1px solid var(--border-soft)",
                borderRadius: 8,
                padding: "0.75rem 1rem",
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  color: "var(--fg-muted)",
                  textTransform: "uppercase",
                  marginBottom: 8,
                }}
              >
                Напорын задаргаа (БНбД 41-01-2019 §6.3)
              </div>
              <table style={tableStyle}>
                <tbody>
                  <BreakdownRow
                    label="Магистрал шугам — үрэлтийн алдагдал"
                    value_m={results.pump.breakdown.supplyFriction_m}
                  />
                  <BreakdownRow
                    label="Эргэх шугам — үрэлтийн алдагдал"
                    value_m={results.pump.breakdown.returnFriction_m}
                  />
                  <BreakdownRow
                    label="Хэрэглэгчийн нөөц (0.15 МПа)"
                    value_m={results.pump.breakdown.consumerReserve_m}
                  />
                  <BreakdownRow
                    label="Хамгийн бага H шаардлага"
                    value_m={results.pump.H_m}
                    bold
                  />
                  <BreakdownRow
                    label="Дизайн нөөц"
                    value_m={results.pump.breakdown.safetyMargin_m}
                    muted
                  />
                  <BreakdownRow
                    label="Зөвлөсөн H"
                    value_m={results.pump.H_m + results.pump.breakdown.safetyMargin_m}
                    bold
                    accent
                  />
                </tbody>
              </table>
            </div>
          )}

          {results.heatLoss && (
            <div
              style={{
                marginTop: 12,
                background: "var(--bg-card)",
                border: "1px solid var(--border-soft)",
                borderRadius: 8,
                padding: "0.75rem 1rem",
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  color: "var(--fg-muted)",
                  textTransform: "uppercase",
                  marginBottom: 8,
                }}
              >
                Дулааны алдагдал (БНбД 41-04-13)
              </div>
              <table style={tableStyle}>
                <tbody>
                  <HeatRow
                    label="Нийт алдагдал"
                    value={`${(results.heatLoss.totalHeatLoss_W / 1000).toFixed(2)} кВт`}
                    bold
                  />
                  <HeatRow
                    label="Нийт ачааллын"
                    value={`${(results.heatLoss.fractionOfLoad * 100).toFixed(1)} %`}
                    muted
                  />
                  <HeatRow
                    label="Источникийн нийлүүлэх T"
                    value={`${results.heatLoss.sourceSupplyTemp_C.toFixed(1)} °C`}
                  />
                  <HeatRow
                    label="Алс хэрэглэгчийн T (min)"
                    value={`${results.heatLoss.minConsumerSupplyTemp_C.toFixed(1)} °C`}
                    bold
                    accent={results.heatLoss.minConsumerSupplyTemp_C >= 80}
                    warn={results.heatLoss.minConsumerSupplyTemp_C < 80}
                  />
                </tbody>
              </table>
              {results.heatLoss.minConsumerSupplyTemp_C >= 80 ? (
                <div style={{ marginTop: 6, fontSize: 11, color: "var(--fg-muted)" }}>
                  ✓ БНбД 41-01-2019 §5.4 биелэв (≥ 80 °C). Хэрэглэгчийн ИТП-д
                  зориулсан температурын марж хангалттай.
                </div>
              ) : (
                <div
                  style={{
                    marginTop: 6,
                    fontSize: 11,
                    color: "var(--danger, #c33)",
                    fontWeight: 600,
                  }}
                >
                  ⚠ БНбД 41-01-2019 §5.4 зөрчигдөв. Магистралын дулаалгыг
                  нэмэх / DN-ийг өсгөх шаардлагатай.
                </div>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-soft)", padding: "0.75rem", borderRadius: 8 }}>
      <div style={{ fontSize: 11, color: "var(--fg-muted)", textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 20, fontFamily: "var(--font-mono)", color: "var(--accent)", marginTop: 4 }}>{value}</div>
    </div>
  );
}

const tableStyle: CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 13,
  fontFamily: "var(--font-mono)",
};

function Th({ children }: { children: ReactNode }) {
  return (
    <th
      style={{
        padding: "0.4rem 0.6rem",
        textAlign: "left",
        borderBottom: "1px solid var(--border)",
        color: "var(--fg-muted)",
        fontWeight: 600,
        fontSize: 12,
        textTransform: "uppercase",
      }}
    >
      {children}
    </th>
  );
}

function Td({ children, red }: { children: ReactNode; red?: boolean }) {
  return (
    <td
      style={{
        padding: "0.35rem 0.6rem",
        borderBottom: "1px solid var(--border-soft)",
        color: red ? "var(--danger)" : "var(--fg)",
      }}
    >
      {children}
    </td>
  );
}

/** Phase 5D.5 — single row in the heat-loss summary table.
 *  Accepts an already-formatted value string (the heat-loss numbers
 *  span W / kW / % / °C, so we let the caller format). Same visual
 *  family as BreakdownRow. */
function HeatRow({
  label,
  value,
  bold,
  muted,
  accent,
  warn,
}: {
  label: string;
  value: string;
  bold?: boolean;
  muted?: boolean;
  accent?: boolean;
  warn?: boolean;
}) {
  const color = warn
    ? "var(--danger, #c33)"
    : accent
      ? "var(--accent)"
      : muted
        ? "var(--fg-muted)"
        : "var(--fg)";
  const fontWeight = bold ? 600 : 400;
  return (
    <tr>
      <td
        style={{
          padding: "0.3rem 0.5rem",
          color,
          fontWeight,
          fontSize: 13,
          fontFamily: "inherit",
        }}
      >
        {label}
      </td>
      <td
        style={{
          padding: "0.3rem 0.5rem",
          color,
          fontWeight,
          fontFamily: "var(--font-mono)",
          textAlign: "right",
          whiteSpace: "nowrap",
        }}
      >
        {value}
      </td>
    </tr>
  );
}

/** Single row in the pump-head breakdown table.
 *  Surfaces each component of H_m in metres of water — engineers can
 *  reconcile the solver's answer against БНбД 41-01 §6.3 hand-calc. */
function BreakdownRow({
  label,
  value_m,
  bold,
  muted,
  accent,
}: {
  label: string;
  value_m: number;
  bold?: boolean;
  muted?: boolean;
  accent?: boolean;
}) {
  const color = accent ? "var(--accent)" : muted ? "var(--fg-muted)" : "var(--fg)";
  const fontWeight = bold ? 600 : 400;
  return (
    <tr>
      <td
        style={{
          padding: "0.3rem 0.5rem",
          color,
          fontWeight,
          fontSize: 13,
          fontFamily: "inherit",
        }}
      >
        {label}
      </td>
      <td
        style={{
          padding: "0.3rem 0.5rem",
          color,
          fontWeight,
          fontFamily: "var(--font-mono)",
          textAlign: "right",
          whiteSpace: "nowrap",
        }}
      >
        {value_m.toFixed(2)} м
      </td>
    </tr>
  );
}
