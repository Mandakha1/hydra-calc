/**
 * Templates gallery — modal that lets engineers pick a pre-built scheme as starting point.
 */
import { useMemo, useState } from "react";
import { SCHEME_TEMPLATES, type SchemeTemplate } from "../schemeLibrary";

const CATEGORY_LABELS: Record<string, string> = {
  small: "Жижиг (< 1 МВт)",
  medium: "Дунд (1-3 МВт)",
  large: "Том (3+ МВт)",
  specialty: "Тусгай",
};

interface Props {
  onPick: (tpl: SchemeTemplate) => void;
  onCancel: () => void;
}

export function TemplatesGallery({ onPick, onCancel }: Props) {
  const [filter, setFilter] = useState<string | "all">("all");

  const grouped = useMemo(() => {
    const out: Record<string, SchemeTemplate[]> = {};
    for (const tpl of SCHEME_TEMPLATES) {
      if (filter !== "all" && tpl.category !== filter) continue;
      if (!out[tpl.category]) out[tpl.category] = [];
      out[tpl.category]!.push(tpl);
    }
    return out;
  }, [filter]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(11, 17, 23, 0.85)",
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
          width: "min(960px, 96vw)",
          maxHeight: "92vh",
          overflowY: "auto",
          boxShadow: "var(--shadow-lg)",
          padding: "1.5rem",
        }}
      >
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1.25rem" }}>
          <div>
            <h2 style={{ margin: 0 }}>Загвар сонгоно уу</h2>
            <p style={{ margin: "0.25rem 0 0", color: "var(--fg-muted)", fontSize: 14 }}>
              Бодит УБ-н сүлжээний жишээ дээр үндэслэсэн зразец схемээс эхэлж, өөрийн төсөлд тохируулна уу.
            </p>
          </div>
          <button
            onClick={onCancel}
            style={{ background: "transparent", border: 0, color: "var(--fg-muted)", fontSize: 22, cursor: "pointer" }}
            aria-label="Хаах"
          >
            ✕
          </button>
        </header>

        {/* Filter chips */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: "1rem" }}>
          <Chip active={filter === "all"} onClick={() => setFilter("all")}>Бүгд</Chip>
          {Object.keys(CATEGORY_LABELS).map((k) => (
            <Chip key={k} active={filter === k} onClick={() => setFilter(k)}>
              {CATEGORY_LABELS[k]}
            </Chip>
          ))}
        </div>

        {/* Empty (custom from scratch) */}
        <button
          onClick={() => onPick(emptyTpl)}
          style={{
            width: "100%",
            padding: "1rem",
            background: "var(--bg)",
            border: "1px dashed var(--border)",
            borderRadius: 8,
            color: "var(--fg-muted)",
            cursor: "pointer",
            marginBottom: "1.25rem",
            textAlign: "left",
          }}
        >
          <div style={{ fontWeight: 600, color: "var(--fg)" }}>＋ Хоосон төсөл</div>
          <div style={{ fontSize: 13 }}>Эхнээс нь өөрөө бүтээх</div>
        </button>

        {/* Templates grid */}
        {Object.keys(grouped).length === 0 && (
          <div style={{ color: "var(--fg-muted)", textAlign: "center", padding: "2rem" }}>
            Загвар олдсонгүй
          </div>
        )}
        {Object.entries(grouped).map(([cat, items]) => (
          <section key={cat} style={{ marginBottom: "1.5rem" }}>
            <h3 style={{ margin: "0 0 0.6rem", fontSize: 14, color: "var(--fg-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              {CATEGORY_LABELS[cat]}
            </h3>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
                gap: 12,
              }}
            >
              {items.map((tpl) => (
                <button
                  key={tpl.key}
                  onClick={() => onPick(tpl)}
                  style={{
                    background: "var(--bg-elev)",
                    border: "1px solid var(--border-soft)",
                    borderRadius: 8,
                    padding: "1rem",
                    textAlign: "left",
                    cursor: "pointer",
                    transition: "border-color 120ms, transform 120ms",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = "var(--accent)";
                    e.currentTarget.style.transform = "translateY(-2px)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = "var(--border-soft)";
                    e.currentTarget.style.transform = "translateY(0)";
                  }}
                >
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>{tpl.name}</div>
                  <div style={{ fontSize: 13, color: "var(--fg-muted)", marginBottom: 8, lineHeight: 1.45 }}>
                    {tpl.description}
                  </div>
                  <div
                    style={{
                      display: "inline-block",
                      padding: "0.2rem 0.5rem",
                      fontSize: 11,
                      background: "var(--accent-bg)",
                      color: "var(--accent)",
                      borderRadius: 4,
                      fontFamily: "var(--font-mono)",
                    }}
                  >
                    {tpl.scope}
                  </div>
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

const emptyTpl: SchemeTemplate = {
  key: "empty",
  name: "Хоосон",
  description: "",
  category: "specialty",
  scope: "",
  build: () => ({
    nodes: [],
    pipes: [],
    schemaVersion: 5,
    settings: {
      networkType: "two_pipe_closed",
      temperatureScheduleKey: "95_70",
      city: "Улаанбаатар",
      primaryMaterialCategory: "steel",
      localLossesFraction: 0.3,
      sourcePressure_mpa: 0.6,
    },
  }),
};

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "0.35rem 0.75rem",
        fontSize: 12,
        background: active ? "var(--accent-bg)" : "var(--bg)",
        color: active ? "var(--accent)" : "var(--fg-muted)",
        border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
        borderRadius: 99,
        cursor: "pointer",
        fontFamily: "var(--font-mono)",
      }}
    >
      {children}
    </button>
  );
}
