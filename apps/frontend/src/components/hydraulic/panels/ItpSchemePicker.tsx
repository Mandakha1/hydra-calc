/**
 * ИТП scheme picker — modal listing 15 СП 41-101 connection schemes from packages/shared.
 * Engineer picks → scheme components attach to selected node + asciiTopology stored as notes.
 */
import { useMemo, useState } from "react";
import { ITP_SCHEMES, type ItpScheme } from "shared";

interface Props {
  onPick: (scheme: ItpScheme) => void;
  onCancel: () => void;
}

const CONNECTION_LABELS: Record<string, string> = {
  zavisimaya: "Хамаарал (зависимая)",
  nezavisimaya: "Хамааралгүй (независимая)",
};

const HEATING_LABELS: Record<string, string> = {
  direct: "Шууд (хольцгүй)",
  elevator: "Элеваторт",
  elevator_with_regulator: "Элеватор + регулятор",
  mixing_pump: "Холих насос",
  heat_exchanger: "Дулаан солилцуурт",
};

const DHW_LABELS: Record<string, string> = {
  none: "—",
  open_4pipe: "Нээлттэй (4-шугам)",
  closed_single_stage_parallel: "Битүү 1-шат, зэрэгцээ",
  closed_single_stage_preswitched: "Битүү 1-шат, урьдчилан",
  closed_two_stage_mixed: "Битүү 2-шат, холимог",
  closed_two_stage_sequential: "Битүү 2-шат, дараалсан",
  circulation_loop_only: "Зөвхөн эргэлтийн гогцоо",
};

export function ItpSchemePicker({ onPick, onCancel }: Props) {
  const [filterConn, setFilterConn] = useState<string | "all">("all");
  const [filterHeat, setFilterHeat] = useState<string | "all">("all");
  const [filterDhw, setFilterDhw] = useState<string | "all">("all");
  const [selected, setSelected] = useState<ItpScheme | null>(null);

  const filtered = useMemo(() => {
    return ITP_SCHEMES.filter((s) => {
      if (filterConn !== "all" && s.connection !== filterConn) return false;
      if (filterHeat !== "all" && s.heating !== filterHeat) return false;
      if (filterDhw !== "all" && s.dhw !== filterDhw) return false;
      return true;
    });
  }, [filterConn, filterHeat, filterDhw]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(26, 34, 51, 0.7)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 200,
        padding: "1rem",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          width: "min(1100px, 96vw)",
          maxHeight: "92vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "var(--shadow-lg)",
        }}
      >
        <header
          style={{
            padding: "1.25rem 1.5rem",
            borderBottom: "1px solid var(--border-soft)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div>
            <h2 style={{ margin: 0 }}>ИТП холболтын схем сонгох</h2>
            <p style={{ margin: "0.25rem 0 0", color: "var(--fg-muted)", fontSize: 13 }}>
              СП 41-101-95 + Politerm Zulu — {ITP_SCHEMES.length} стандарт схем
            </p>
          </div>
          <button onClick={onCancel} style={{ background: "transparent", border: 0, color: "var(--fg-muted)", fontSize: 22, cursor: "pointer" }}>✕</button>
        </header>

        {/* Filters */}
        <div style={{ padding: "0.75rem 1.5rem", borderBottom: "1px solid var(--border-soft)", display: "flex", gap: 12, flexWrap: "wrap" }}>
          <FilterSelect label="Холболт" value={filterConn} onChange={setFilterConn} options={[["all", "Бүгд"], ...Object.entries(CONNECTION_LABELS)]} />
          <FilterSelect label="Халаалт" value={filterHeat} onChange={setFilterHeat} options={[["all", "Бүгд"], ...Object.entries(HEATING_LABELS)]} />
          <FilterSelect label="ХУС" value={filterDhw} onChange={setFilterDhw} options={[["all", "Бүгд"], ...Object.entries(DHW_LABELS)]} />
          <div style={{ marginLeft: "auto", color: "var(--fg-muted)", fontSize: 12, fontFamily: "var(--font-mono)" }}>
            {filtered.length} / {ITP_SCHEMES.length} схем
          </div>
        </div>

        {/* Body — list + preview */}
        <div style={{ flex: 1, display: "grid", gridTemplateColumns: "minmax(360px, 1fr) minmax(420px, 1.4fr)", overflow: "hidden" }}>
          {/* List */}
          <div style={{ overflowY: "auto", borderRight: "1px solid var(--border-soft)" }}>
            {filtered.map((s, i) => (
              <button
                key={s.key}
                onClick={() => setSelected(s)}
                style={{
                  width: "100%",
                  padding: "0.85rem 1.25rem",
                  background: selected?.key === s.key ? "var(--accent-bg)" : "transparent",
                  border: 0,
                  borderLeft: `3px solid ${selected?.key === s.key ? "var(--accent)" : "transparent"}`,
                  borderBottom: "1px solid var(--border-soft)",
                  cursor: "pointer",
                  textAlign: "left",
                  color: "var(--fg)",
                }}
              >
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-dim)", marginBottom: 4 }}>
                  {String(i + 1).padStart(2, "0")} · {s.zulu_no ? `Politerm № ${s.zulu_no}` : "—"}
                </div>
                <div style={{ fontWeight: 600, marginBottom: 2 }}>{s.name_mn}</div>
                <div style={{ fontSize: 12, color: "var(--fg-muted)", fontFamily: "var(--font-mono)" }}>
                  {CONNECTION_LABELS[s.connection]} · {HEATING_LABELS[s.heating] ?? s.heating}
                </div>
                <div style={{ marginTop: 4, fontSize: 11, color: "var(--fg-muted)" }}>
                  t1: {s.source_temp_range_c?.[0]}-{s.source_temp_range_c?.[1]}°C
                </div>
              </button>
            ))}
            {filtered.length === 0 && (
              <div style={{ padding: "2rem", textAlign: "center", color: "var(--fg-muted)" }}>
                Шүүлтэд тохирох схем алга
              </div>
            )}
          </div>

          {/* Preview */}
          <div style={{ overflowY: "auto", padding: "1.25rem 1.5rem" }}>
            {!selected ? (
              <div style={{ textAlign: "center", color: "var(--fg-muted)", marginTop: "3rem" }}>
                Зүүн талаас схем сонгоно уу
              </div>
            ) : (
              <>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-dim)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                  {selected.name_ru}
                </div>
                <h3 style={{ marginTop: 4 }}>{selected.name_mn}</h3>
                <p style={{ fontSize: 13 }}>{selected.description_mn}</p>

                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: "0.85rem" }}>
                  <span className="badge badge-accent">{CONNECTION_LABELS[selected.connection]}</span>
                  <span className="badge">{HEATING_LABELS[selected.heating] ?? selected.heating}</span>
                  {selected.dhw !== "none" && <span className="badge">{DHW_LABELS[selected.dhw]}</span>}
                </div>

                {selected.use_case_mn && (
                  <Section title="Хэрэглэх тохиолдол">
                    <p style={{ fontSize: 13 }}>{selected.use_case_mn}</p>
                  </Section>
                )}

                {selected.asciiTopology && (
                  <Section title="Топологи">
                    <pre style={asciiBox}>{selected.asciiTopology}</pre>
                  </Section>
                )}

                {selected.components && selected.components.length > 0 && (
                  <Section title={`Тоног төхөөрөмж (${selected.components.length})`}>
                    <table style={tableStyle}>
                      <thead>
                        <tr>
                          <Th>Төрөл</Th>
                          <Th>Үүрэг</Th>
                          <Th>Тоо</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {selected.components.map((c, i) => (
                          <tr key={i}>
                            <Td>{c.kind}</Td>
                            <Td>{c.role}</Td>
                            <Td>{c.count ?? 1}</Td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </Section>
                )}

                {(selected.pros_mn?.length || selected.cons_mn?.length) && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: "0.85rem" }}>
                    {selected.pros_mn && (
                      <div>
                        <div className="hdr-mono">Давуу</div>
                        <ul style={{ paddingLeft: 18, fontSize: 13, color: "var(--success)" }}>
                          {selected.pros_mn.map((p, i) => <li key={i}>{p}</li>)}
                        </ul>
                      </div>
                    )}
                    {selected.cons_mn && (
                      <div>
                        <div className="hdr-mono">Хязгаар</div>
                        <ul style={{ paddingLeft: 18, fontSize: 13, color: "var(--warning)" }}>
                          {selected.cons_mn.map((p, i) => <li key={i}>{p}</li>)}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: "0.85rem 1.5rem", borderTop: "1px solid var(--border-soft)", display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button onClick={onCancel} style={btnStyle}>Цуцлах</button>
          <button
            disabled={!selected}
            onClick={() => selected && onPick(selected)}
            style={{ ...btnStyle, background: "var(--accent)", color: "white", borderColor: "var(--accent)", fontWeight: 600, opacity: selected ? 1 : 0.4 }}
          >
            Энэ схемийг хэрэглэх ✓
          </button>
        </div>
      </div>
    </div>
  );
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: Array<[string, string]> }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span className="hdr-mono">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} style={selectStyle}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: "1rem" }}>
      <div className="hdr-mono" style={{ marginBottom: 6 }}>{title}</div>
      {children}
    </div>
  );
}

const selectStyle: React.CSSProperties = {
  padding: "0.35rem 0.5rem",
  fontSize: 12,
  background: "var(--bg)",
  color: "var(--fg)",
  border: "1px solid var(--border)",
  borderRadius: 4,
  fontFamily: "var(--font-mono)",
};

const btnStyle: React.CSSProperties = {
  padding: "0.55rem 1.2rem",
  fontSize: 14,
  border: "1px solid var(--border)",
  background: "var(--bg-soft)",
  color: "var(--fg)",
  borderRadius: 6,
  cursor: "pointer",
};

const asciiBox: React.CSSProperties = {
  background: "var(--bg)",
  border: "1px solid var(--border-soft)",
  borderRadius: 6,
  padding: "0.85rem",
  fontFamily: "var(--font-mono)",
  fontSize: 11,
  lineHeight: 1.5,
  overflowX: "auto",
  whiteSpace: "pre",
  color: "var(--fg)",
};

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 12,
  fontFamily: "var(--font-mono)",
};

function Th({ children }: { children: React.ReactNode }) {
  return <th style={{ padding: "0.3rem 0.5rem", textAlign: "left", borderBottom: "1px solid var(--border)", color: "var(--fg-muted)", fontWeight: 600, fontSize: 11, textTransform: "uppercase" }}>{children}</th>;
}
function Td({ children }: { children: React.ReactNode }) {
  return <td style={{ padding: "0.25rem 0.5rem", borderBottom: "1px solid var(--border-soft)", color: "var(--fg)" }}>{children}</td>;
}
