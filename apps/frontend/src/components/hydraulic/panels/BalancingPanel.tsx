import { useMemo, type CSSProperties, type ReactNode } from "react";
import { useHydraulicStore } from "../hydraulicStore";
import { balanceConsumers } from "../calc/threeModeEngine";
import { NORM_THRESHOLDS } from "shared";

export function BalancingPanel() {
  const nodes = useHydraulicStore((s) => s.nodes);
  const results = useHydraulicStore((s) => s.results);

  const balancing = useMemo(() => {
    if (!results) return [];
    return balanceConsumers(nodes, results, NORM_THRESHOLDS.dp_consumer_min_mpa);
  }, [nodes, results]);

  if (!results) {
    return (
      <div style={{ padding: "2rem", color: "var(--fg-muted)", textAlign: "center" }}>
        Тооцоолол хийгдээгүй. Эхлээд "⚙ Тооцоолох" товч дарна уу.
      </div>
    );
  }

  return (
    <div style={{ padding: "1.25rem", overflowY: "auto", height: "100%" }}>
      <header style={{ marginBottom: "1.25rem" }}>
        <h3 style={{ margin: 0 }}>⚖ Гидравлик тэнцвэржүүлэлт — Регуляторын шайба</h3>
        <p style={{ margin: "0.25rem 0", fontSize: 13, color: "var(--fg-muted)" }}>
          Хэрэглэгч бүр дээрх илүү даралтыг шингээх шайбын диаметр.
          СНиП 41-02-2003 Формула 31 / СП 124.13330.2012.
        </p>
      </header>

      {balancing.length === 0 && (
        <div
          style={{
            padding: "1.5rem",
            background: "var(--bg-card)",
            border: "1px solid var(--success)",
            borderRadius: 8,
            color: "var(--success)",
          }}
        >
          ✓ Сүлжээ балансжсан — нэмэлт шайба шаардлагагүй (бүх хэрэглэгчид яг хэрэгцээний даралттай ирсэн).
        </div>
      )}

      {balancing.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <Th>№</Th>
                <Th>Хэрэглэгч</Th>
                <Th>Ирсэн (MPa)</Th>
                <Th>Шаардлага (MPa)</Th>
                <Th>Илүү (кПа)</Th>
                <Th>G (кг/с)</Th>
                <Th>D шайба (мм)</Th>
                <Th>Цуваа</Th>
                <Th>Тэмдэглэл</Th>
              </tr>
            </thead>
            <tbody>
              {balancing.map((b, i) => (
                <tr key={b.nodeId}>
                  <Td>{i + 1}</Td>
                  <Td>{b.nodeLabel}</Td>
                  <Td>{b.arrivedPressure_mpa.toFixed(3)}</Td>
                  <Td>{b.requiredPressure_mpa.toFixed(3)}</Td>
                  <Td>{(b.excessPressure_pa / 1000).toFixed(1)}</Td>
                  <Td>{b.G_kg_s.toFixed(3)}</Td>
                  <Td>
                    <b style={{ color: "var(--accent)" }}>{b.washer.D_orifice_mm}</b>
                  </Td>
                  <Td>{b.washer.inSeries > 1 ? `${b.washer.inSeries}×` : "—"}</Td>
                  <Td style={{ color: b.washer.warning ? "var(--warning)" : "var(--fg-dim)", fontSize: 11 }}>
                    {b.washer.warning ?? "OK"}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <details style={{ marginTop: "1.5rem", color: "var(--fg-muted)", fontSize: 13 }}>
        <summary style={{ cursor: "pointer" }}>📐 Томъёоны тайлбар</summary>
        <pre
          style={{
            background: "var(--bg-card)",
            padding: "0.75rem",
            borderRadius: 6,
            fontFamily: "var(--font-mono)",
            fontSize: 12,
            overflowX: "auto",
            color: "var(--fg)",
            marginTop: "0.5rem",
          }}
        >
{`D = √(4·G / (π·μ·√(2·ρ·ΔP))) · 1000   [мм]

  μ  = 0.62 (тонкая шайба)
  ρ  = 935 кг/м³ (130°C)
  ΔP = илүү даралт, Па
  G  = массын урсгал, кг/с

Хэрэв D < 3 мм → шайбыг цуваа холбон тоо нэмэх.
Хэрэв D > 25 мм → даралтын регулятор сонго.`}
        </pre>
      </details>
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

function Td({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <td
      style={{
        padding: "0.35rem 0.6rem",
        borderBottom: "1px solid var(--border-soft)",
        color: "var(--fg)",
        ...style,
      }}
    >
      {children}
    </td>
  );
}
