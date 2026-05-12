/**
 * Bill of Materials panel — auto-generated cost estimate (өртгийн смет).
 */
import { useMemo, type CSSProperties } from "react";
import { useHydraulicStore } from "../hydraulicStore";
import { generateBom, formatMnt } from "../calc/bom";

const CATEGORY_LABELS: Record<string, { label: string; icon: string; color: string }> = {
  pipe: { label: "Хоолой", icon: "／", color: "#1f5faa" },
  valve: { label: "Арматур", icon: "▷◁", color: "#b7861a" },
  fitting: { label: "Холбоос", icon: "└", color: "#7b7e78" },
  equipment: { label: "Тоног төхөөрөмж", icon: "⚙", color: "#3a7044" },
  labor: { label: "Ажил", icon: "👷", color: "#485775" },
  transport: { label: "Тээвэр", icon: "🚚", color: "#485775" },
};

export function BomPanel() {
  const nodes = useHydraulicStore((s) => s.nodes);
  const pipes = useHydraulicStore((s) => s.pipes);
  const settings = useHydraulicStore((s) => s.settings);

  const bom = useMemo(
    () => generateBom({ nodes, pipes, settings, schemaVersion: 5 }),
    [nodes, pipes, settings],
  );

  if (bom.lines.length === 0) {
    return (
      <div style={{ padding: "2rem", color: "var(--bp-text-3)", textAlign: "center" }}>
        Сүлжээнд хоолой/тоног төхөөрөмж байхгүй учир смет тооцоолох боломжгүй.
      </div>
    );
  }

  return (
    <div style={{ padding: "1.25rem", overflowY: "auto", height: "100%" }}>
      <header style={{ marginBottom: "1.25rem", display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <h3 style={{ margin: 0 }}>💰 Өртгийн смет (BoM)</h3>
          <p style={{ margin: "0.25rem 0", fontSize: 13, color: "var(--bp-text-2)" }}>
            УБ-ын 2026 он retail үнэ. Автомат тооцоолсон, vendor quote-той дахин нягтлуулна.
          </p>
        </div>
        <div style={{ textAlign: "right" }}>
          <div className="hdr-mono">Нийт өртөг</div>
          <div style={{ fontSize: 28, fontFamily: "var(--font-display)", fontStyle: "italic", color: "var(--bp-blue)" }}>
            {formatMnt(bom.total_mnt)} ₮
          </div>
          <div style={{ fontSize: 11, color: "var(--bp-text-3)" }}>
            ≈ {(bom.total_mnt / 3500).toFixed(0)} USD (3500₮/$)
          </div>
        </div>
      </header>

      {/* Category summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 8, marginBottom: "1.5rem" }}>
        {Object.entries(bom.byCategory).map(([cat, amount]) => {
          const meta = CATEGORY_LABELS[cat];
          return (
            <div key={cat} style={{ ...catCardStyle, borderLeftColor: meta?.color ?? "var(--bp-line)" }}>
              <div style={{ fontSize: 11, color: "var(--bp-text-3)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                {meta?.icon} {meta?.label ?? cat}
              </div>
              <div style={{ fontSize: 20, fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--bp-text)", marginTop: 4 }}>
                {formatMnt(amount)}
              </div>
              <div style={{ fontSize: 10, color: "var(--bp-text-3)" }}>
                {((amount / bom.subtotal_mnt) * 100).toFixed(1)}% subtotal
              </div>
            </div>
          );
        })}
      </div>

      {/* Pipe breakdown by DN */}
      {bom.pipesByDn.length > 0 && (
        <section style={cardStyle}>
          <div className="hdr-mono" style={{ marginBottom: 8 }}>Хоолойн задаргаа DN-ээр</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 6 }}>
            {bom.pipesByDn.map((p) => (
              <div key={p.dn} style={{ background: "var(--bp-bg)", padding: "0.5rem 0.65rem", borderRadius: 4, border: "1px solid var(--bp-line-2)" }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--bp-text-3)" }}>DN{p.dn}</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 14, color: "var(--bp-text)", fontWeight: 600 }}>{p.totalLength_m.toFixed(1)}м</div>
                <div style={{ fontSize: 10, color: "var(--bp-text-3)" }}>{formatMnt(p.total_mnt)} ₮</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Detailed line items */}
      <section style={cardStyle}>
        <div className="hdr-mono" style={{ marginBottom: 8 }}>Дэлгэрэнгүй смет ({bom.lines.length} мөр)</div>
        <table style={tableStyle}>
          <thead>
            <tr>
              <Th>№</Th>
              <Th>Барааны нэр</Th>
              <Th right>Тоо хэмжээ</Th>
              <Th>Нэгж</Th>
              <Th right>Нэгж үнэ ₮</Th>
              <Th right>Нийт ₮</Th>
            </tr>
          </thead>
          <tbody>
            {bom.lines.map((l, i) => (
              <tr key={i}>
                <Td>{i + 1}</Td>
                <Td>
                  <span style={{ fontSize: 11, marginRight: 6, color: CATEGORY_LABELS[l.category]?.color ?? "var(--bp-text-3)" }}>
                    {CATEGORY_LABELS[l.category]?.icon}
                  </span>
                  {l.name}
                  {l.source && <div style={{ fontSize: 10, color: "var(--bp-text-3)" }}>{l.source}</div>}
                </Td>
                <Td right>{l.quantity.toLocaleString("mn-MN", { maximumFractionDigits: 1 })}</Td>
                <Td>{l.unit}</Td>
                <Td right style={{ fontFamily: "var(--font-mono)" }}>{formatMnt(l.unitPrice_mnt)}</Td>
                <Td right style={{ fontFamily: "var(--font-mono)", fontWeight: 600 }}>{formatMnt(l.totalPrice_mnt)}</Td>
              </tr>
            ))}
            <tr style={{ borderTop: "2px solid var(--bp-text)" }}>
              <Td colSpan={5} style={{ textAlign: "right", fontWeight: 600 }}>Барааны subtotal</Td>
              <Td right style={{ fontWeight: 600, fontFamily: "var(--font-mono)" }}>{formatMnt(bom.subtotal_mnt)}</Td>
            </tr>
            <tr>
              <Td colSpan={5} style={{ textAlign: "right", color: "var(--bp-text-3)" }}>+ НӨАТ 10%</Td>
              <Td right style={{ fontFamily: "var(--font-mono)" }}>{formatMnt(bom.vat_mnt)}</Td>
            </tr>
            <tr>
              <Td colSpan={5} style={{ textAlign: "right", color: "var(--bp-text-3)" }}>+ Ажил суурилуулалт 32%</Td>
              <Td right style={{ fontFamily: "var(--font-mono)" }}>{formatMnt(bom.laborMarkup_mnt)}</Td>
            </tr>
            <tr>
              <Td colSpan={5} style={{ textAlign: "right", color: "var(--bp-text-3)" }}>+ Тээвэр 7%</Td>
              <Td right style={{ fontFamily: "var(--font-mono)" }}>{formatMnt(bom.transportMarkup_mnt)}</Td>
            </tr>
            <tr style={{ borderTop: "2px solid var(--bp-text)", background: "var(--bp-bg)" }}>
              <Td colSpan={5} style={{ textAlign: "right", fontWeight: 700, fontSize: 14 }}>НИЙТ</Td>
              <Td right style={{ fontWeight: 700, fontSize: 16, fontFamily: "var(--font-mono)", color: "var(--bp-blue)" }}>
                {formatMnt(bom.total_mnt)} ₮
              </Td>
            </tr>
          </tbody>
        </table>
      </section>
    </div>
  );
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return <th style={{ padding: "0.4rem 0.6rem", textAlign: right ? "right" : "left", borderBottom: "1px solid var(--bp-line)", color: "var(--bp-text-3)", fontWeight: 600, fontSize: 11, textTransform: "uppercase" }}>{children}</th>;
}
function Td({ children, right, style, colSpan }: { children: React.ReactNode; right?: boolean; style?: CSSProperties; colSpan?: number }) {
  return <td colSpan={colSpan} style={{ padding: "0.35rem 0.6rem", textAlign: right ? "right" : "left", borderBottom: "1px solid var(--bp-line-2)", color: "var(--bp-text)", fontSize: 12, ...style }}>{children}</td>;
}

const cardStyle: CSSProperties = {
  background: "var(--bp-bg-2)",
  border: "1px solid var(--bp-line)",
  borderRadius: 8,
  padding: "1rem",
  marginBottom: "1rem",
};

const catCardStyle: CSSProperties = {
  background: "var(--bp-bg-2)",
  border: "1px solid var(--bp-line)",
  borderLeft: "3px solid var(--bp-blue)",
  borderRadius: 6,
  padding: "0.6rem 0.8rem",
};

const tableStyle: CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 12,
};
