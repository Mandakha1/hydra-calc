/**
 * Phase 9.1 — Compliance tab view.
 *
 * Engineer-facing panel for triggering compliance check + reviewing
 * violations. Lazy-loaded from HydraulicV5 so the rule registry +
 * (future) PDF renderer stay out of the initial bundle.
 *
 * UI layout:
 *   - Top: "Шалгалт хийх" button + summary tiles
 *   - Filter: severity chips (All / Critical / Error / Warn / Info)
 *   - Table: severity badge | rule name | entity | message | fix hint
 *   - Footer: standards reference + "📄 PDF (zaval Drawing Set)" placeholder
 *
 * The actual Compliance Report PDF integration ships in Phase 9.4
 * via `pdfComplianceReport.ts`. The placeholder button here surfaces
 * the next-step affordance so engineers know what's coming.
 */
import { useMemo, useState, type CSSProperties } from "react";
import { useHydraulicStore } from "../hydraulicStore";
import {
  runComplianceCheck,
  severityLabel,
  categoryLabel,
  type ComplianceReport,
  type RuleResult,
  type RuleSeverity,
} from "../calc/compliance/ruleEngine";
import { ALL_RULES } from "../calc/compliance/rules";

type SeverityFilter = "all" | RuleSeverity;

const SEVERITY_COLORS: Record<RuleSeverity, { bg: string; fg: string }> = {
  critical: { bg: "#fee2e2", fg: "#7f1d1d" },
  error: { bg: "#fee", fg: "#a32d2d" },
  warn: { bg: "#fff5e6", fg: "#a35a00" },
  info: { bg: "#e6f1ff", fg: "#185fa5" },
};

export function ComplianceView() {
  const nodes = useHydraulicStore((s) => s.nodes);
  const pipes = useHydraulicStore((s) => s.pipes);
  const settings = useHydraulicStore((s) => s.settings);
  const results = useHydraulicStore((s) => s.results);

  // Cached report — engineer must press "Шалгалт хийх" to (re)compute.
  const [report, setReport] = useState<ComplianceReport | null>(null);
  const [filter, setFilter] = useState<SeverityFilter>("all");

  const runCheck = () => {
    const r = runComplianceCheck(
      { nodes, pipes, settings, schemaVersion: 5 },
      results,
      ALL_RULES,
    );
    setReport(r);
  };

  const filteredResults = useMemo<RuleResult[]>(() => {
    if (!report) return [];
    if (filter === "all") return report.results;
    return report.results.filter((r) => r.severity === filter);
  }, [report, filter]);

  return (
    <div style={containerStyle} data-testid="compliance-view">
      <header style={headerStyle}>
        <div>
          <h3 style={{ margin: 0 }}>📋 Стандарт шалгалт</h3>
          <p style={{ margin: "0.25rem 0 0", fontSize: 12, color: "var(--fg-muted, #666)" }}>
            БНбД 41-02-13 / 41-01-2019 / СП 124.13330.2012 — автомат шалгалт
          </p>
        </div>
        <button
          type="button"
          onClick={runCheck}
          style={primaryBtn}
          data-testid="compliance-run"
        >
          {report ? "🔄 Дахин шалгах" : "▶ Шалгалт хийх"}
        </button>
      </header>

      {!report && (
        <div style={emptyStateStyle} data-testid="compliance-empty">
          <p style={{ fontSize: 14 }}>
            "Шалгалт хийх" дарж {ALL_RULES.length} БНбД дүрэм шалгах
          </p>
          <p style={{ fontSize: 12, color: "var(--fg-muted, #888)" }}>
            Жич: Тооцоо хийгээгүй бол гидравлик дүрэм алгасагдана. Эхлээд ⚙ Тооцоолох товчийг дарна уу.
          </p>
        </div>
      )}

      {report && (
        <>
          <section style={summaryGrid} data-testid="compliance-summary">
            <Stat label="Тэнцсэн" value={report.summary.passedRules} color="#15803d" />
            <Stat label="🔴 Чухал" value={report.summary.critical} color="#7f1d1d" />
            <Stat label="✗ Алдаа" value={report.summary.error} color="#a32d2d" />
            <Stat label="⚠ Анхааруулга" value={report.summary.warn} color="#a35a00" />
            <Stat label="ℹ Мэдээлэл" value={report.summary.info} color="#185fa5" />
            <Stat label="Σ Нийт" value={report.summary.totalViolations} />
          </section>

          {/* Severity filter chips */}
          <section style={filterRow} data-testid="compliance-filters">
            {(["all", "critical", "error", "warn", "info"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setFilter(s)}
                style={{
                  ...chipBtn,
                  ...(filter === s ? chipActive : {}),
                }}
                data-testid={`compliance-filter-${s}`}
              >
                {s === "all" ? "Бүгд" : severityLabel(s)}
              </button>
            ))}
          </section>

          {/* Results table */}
          {filteredResults.length === 0 ? (
            <div style={{ padding: "1rem", textAlign: "center", color: "var(--fg-muted, #888)" }}>
              {report.summary.totalViolations === 0
                ? "✓ Бүх дүрэм тэнцсэн!"
                : "Энэ ангилалд зөрчил алга"}
            </div>
          ) : (
            <table style={tableStyle} data-testid="compliance-table">
              <thead>
                <tr>
                  <th style={thStyle}>Зэрэг</th>
                  <th style={thStyle}>Дүрэм</th>
                  <th style={thStyle}>Объект</th>
                  <th style={thStyle}>Тайлбар</th>
                  <th style={thStyle}>Засах</th>
                </tr>
              </thead>
              <tbody>
                {filteredResults.map((row, idx) => {
                  const rule = ALL_RULES.find((r) => r.id === row.ruleId);
                  const colors = SEVERITY_COLORS[row.severity];
                  return (
                    <tr key={`${row.ruleId}-${idx}`} data-testid={`compliance-row-${row.ruleId}`}>
                      <td style={{ ...tdStyle, background: colors.bg, color: colors.fg, fontWeight: 600 }}>
                        {severityLabel(row.severity)}
                      </td>
                      <td style={tdStyle}>
                        <div>{rule?.name ?? row.ruleId}</div>
                        <div style={{ fontSize: 10, color: "var(--fg-muted, #888)", fontFamily: "var(--font-mono)" }}>
                          {rule?.standardRef}
                        </div>
                      </td>
                      <td style={tdStyle}>
                        {row.entityType && row.entityId ? `${row.entityType}: ${row.entityId}` : "—"}
                      </td>
                      <td style={tdStyle}>{row.message}</td>
                      <td style={{ ...tdStyle, fontSize: 11, color: "var(--fg-muted, #666)" }}>
                        {row.fixHint ?? ""}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          {/* Footer */}
          <footer style={footerStyle}>
            <div style={{ fontSize: 11, color: "var(--fg-muted, #888)" }}>
              Шалгасан: {report.summary.passedRules + report.summary.totalViolations} дүрэм ·{" "}
              {new Date(report.generatedAt).toLocaleString("mn-MN")}
            </div>
            <div style={{ fontSize: 11, color: "var(--fg-muted, #888)", marginTop: 4 }}>
              Стандартууд: БНбД 41-02-13 · БНбД 41-01-2019 · СП 124.13330.2012 · ГОСТ 8732
            </div>
            <div style={{ fontSize: 11, color: "var(--fg-muted, #888)", marginTop: 4 }}>
              📄 Compliance Report PDF — Drawing Set-ийн 7-р хуудас (Phase 9.4-руу нэмэгдэнэ){" "}
              {/* Placeholder — wired in Phase 9.4 */}
            </div>
          </footer>

          {/* Per-category breakdown (lets engineer scan by domain) */}
          <details style={{ marginTop: 12 }}>
            <summary style={{ cursor: "pointer", fontSize: 12, color: "var(--fg-muted, #666)" }}>
              Ангилалаар үзэх
            </summary>
            <ul style={{ marginTop: 6, fontSize: 12, paddingLeft: 16 }}>
              {(["hydraulics", "thermal", "geometry", "materials", "project"] as const).map((c) => {
                const count = report.results.filter((r) => {
                  const rule = ALL_RULES.find((rr) => rr.id === r.ruleId);
                  return rule?.category === c;
                }).length;
                return (
                  <li key={c}>
                    {categoryLabel(c)}: <strong>{count}</strong> зөрчил
                  </li>
                );
              })}
            </ul>
          </details>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div style={statBoxStyle}>
      <span style={{ fontSize: 10, color: "var(--fg-muted, #888)" }}>{label}</span>
      <span style={{ fontSize: 18, fontWeight: 600, fontFamily: "var(--font-mono)", color: color ?? "var(--fg, #222)" }}>
        {value}
      </span>
    </div>
  );
}

/* ─── Styles ────────────────────────────────────────────────────── */

const containerStyle: CSSProperties = {
  padding: 16,
  height: "100%",
  overflow: "auto",
};
const headerStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: 16,
  flexWrap: "wrap",
  gap: 8,
};
const primaryBtn: CSSProperties = {
  padding: "8px 16px",
  background: "var(--accent, #1f5faa)",
  color: "white",
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 600,
};
const emptyStateStyle: CSSProperties = {
  padding: "2rem 1rem",
  textAlign: "center",
  background: "var(--bg-elev, #f8f8fa)",
  border: "1px solid var(--border-soft, #e5e5e5)",
  borderRadius: 8,
};
const summaryGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))",
  gap: 8,
  marginBottom: 14,
};
const statBoxStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 2,
  padding: "8px 12px",
  background: "var(--bg-elev, #f8f8fa)",
  border: "1px solid var(--border-soft, #e5e5e5)",
  borderRadius: 6,
};
const filterRow: CSSProperties = {
  display: "flex",
  gap: 6,
  marginBottom: 12,
  flexWrap: "wrap",
};
const chipBtn: CSSProperties = {
  padding: "4px 10px",
  border: "1px solid var(--border, #ccc)",
  borderRadius: 999,
  fontSize: 11,
  background: "white",
  cursor: "pointer",
};
const chipActive: CSSProperties = {
  background: "var(--accent, #1f5faa)",
  color: "white",
  borderColor: "var(--accent, #1f5faa)",
};
const tableStyle: CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 12,
};
const thStyle: CSSProperties = {
  textAlign: "left",
  padding: "6px 8px",
  borderBottom: "2px solid var(--border, #ddd)",
  fontWeight: 600,
  color: "var(--fg-muted, #666)",
};
const tdStyle: CSSProperties = {
  padding: "6px 8px",
  borderBottom: "1px solid var(--border-soft, #eee)",
  verticalAlign: "top",
};
const footerStyle: CSSProperties = {
  marginTop: 12,
  paddingTop: 8,
  borderTop: "1px solid var(--border-soft, #eee)",
};
