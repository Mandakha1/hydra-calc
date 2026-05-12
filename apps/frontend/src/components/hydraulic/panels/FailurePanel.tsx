/**
 * Failure Simulation panel — Zulu-style "Надежность" feature.
 * Engineer right-clicks any node/pipe → "Энэ эвдэрвэл..." → instant impact analysis.
 */
import { useMemo, useState, type CSSProperties } from "react";
import { useHydraulicStore } from "../hydraulicStore";
import { simulateFailure, findCriticalElements, type FailureSimulation } from "../calc/failureSim";

export function FailurePanel() {
  const nodes = useHydraulicStore((s) => s.nodes);
  const pipes = useHydraulicStore((s) => s.pipes);
  const settings = useHydraulicStore((s) => s.settings);
  const results = useHydraulicStore((s) => s.results);
  const [simResult, setSimResult] = useState<FailureSimulation | null>(null);
  const [criticalList, setCriticalList] = useState<ReturnType<typeof findCriticalElements> | null>(null);
  const [running, setRunning] = useState(false);

  const candidatePipes = pipes;
  const consumerCount = useMemo(
    () => nodes.filter((n) => n.kind?.startsWith("consumer_") || n.kind === "consumer").length,
    [nodes],
  );

  function runOne(elementId: string, mode: "pipe" | "node") {
    setRunning(true);
    try {
      const sim = simulateFailure({ nodes, pipes, settings, schemaVersion: 5 }, elementId, mode, results);
      setSimResult(sim);
      setCriticalList(null);
    } finally {
      setRunning(false);
    }
  }

  function runSweep() {
    setRunning(true);
    setSimResult(null);
    try {
      const list = findCriticalElements({ nodes, pipes, settings, schemaVersion: 5 }, results);
      setCriticalList(list.slice(0, 20));
    } finally {
      setRunning(false);
    }
  }

  if (!results) {
    return (
      <div style={{ padding: "2rem", color: "var(--bp-text-3)", textAlign: "center" }}>
        Тооцоолол хийгдээгүй. Эхлээд &quot;⚙ Тооцоолох&quot; дарж сүлжээний baseline тооцоог хийнэ үү.
      </div>
    );
  }

  return (
    <div style={{ padding: "1.25rem", overflowY: "auto", height: "100%" }}>
      <header style={{ marginBottom: "1rem" }}>
        <h3 style={{ margin: 0 }}>🚨 Failure Simulation — Zulu надёжность</h3>
        <p style={{ margin: "0.25rem 0", fontSize: 13, color: "var(--bp-text-2)" }}>
          Аль ч хоолой/зангилаа эвдрэх үед сүлжээ хэрхэн өөрчлөгдөхийг тооцоолно. Нийт {consumerCount} хэрэглэгчид нөлөө.
        </p>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: "1.5rem" }}>
        <section style={cardStyle}>
          <div className="hdr-mono" style={{ marginBottom: 8 }}>Тодорхой хоолойг туршиж үзэх</div>
          <select
            disabled={running || candidatePipes.length === 0}
            onChange={(e) => e.target.value && runOne(e.target.value, "pipe")}
            value=""
            style={selectStyle}
          >
            <option value="">— Хоолой сонго —</option>
            {candidatePipes.map((p) => (
              <option key={p.id} value={p.id}>
                {p.fromNodeId.slice(0, 12)} → {p.toNodeId.slice(0, 12)} (DN{p.dn})
              </option>
            ))}
          </select>
          <p style={{ fontSize: 11, color: "var(--bp-text-3)", marginTop: 6 }}>
            Сонгосон хоолой эвдрэх үед хэрэглэгчид хэрхэн нөлөөлөхийг харна.
          </p>
        </section>

        <section style={cardStyle}>
          <div className="hdr-mono" style={{ marginBottom: 8 }}>Бүх хоолойн критикийг олох</div>
          <button
            disabled={running}
            onClick={runSweep}
            style={btnStyle}
          >
            {running ? "Боддож байна..." : `🔥 Бүх ${candidatePipes.length} хоолойг шалгах`}
          </button>
          <p style={{ fontSize: 11, color: "var(--bp-text-3)", marginTop: 6 }}>
            N+1 contingency sweep — сүлжээний weak point-уудыг автомат олно.
          </p>
        </section>
      </div>

      {/* Single-element failure result */}
      {simResult && (
        <section style={cardStyle}>
          <h4 style={{ marginTop: 0, color: "var(--bp-red)" }}>
            ⚠ Failure: {simResult.failedLabel}
          </h4>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 8, marginBottom: "1rem" }}>
            <Stat label="Бүх хэрэглэгч" value={simResult.summary.totalConsumers} />
            <Stat label="Нөлөөлсөн" value={simResult.summary.affectedConsumers} tone={simResult.summary.affectedConsumers > 0 ? "warn" : "ok"} />
            <Stat label="Хэвийн >> зөрчилт" value={simResult.summary.newlyFailingConsumers} tone={simResult.summary.newlyFailingConsumers > 0 ? "alert" : "ok"} />
            <Stat label="Огт тасарсан" value={simResult.summary.cutOffConsumers} tone={simResult.summary.cutOffConsumers > 0 ? "critical" : "ok"} />
            <Stat label="Алдсан ачаалал" value={`${(simResult.summary.totalLostLoad_w / 1000).toFixed(0)} кВт`} tone={simResult.summary.totalLostLoad_w > 0 ? "critical" : "ok"} />
            <Stat label="Макс. ΔP" value={`${(simResult.summary.maxPressureDrop_mpa * 1000).toFixed(1)} кПа`} tone={simResult.summary.maxPressureDrop_mpa > 0.05 ? "warn" : "ok"} />
          </div>

          <table style={tableStyle}>
            <thead>
              <tr>
                <Th>Хэрэглэгч</Th>
                <Th right>Baseline P (MPa)</Th>
                <Th right>Failure P (MPa)</Th>
                <Th right>ΔP (кПа)</Th>
                <Th>Төлөв</Th>
              </tr>
            </thead>
            <tbody>
              {simResult.impacts
                .filter((i) => i.pressureDrop_mpa > 0.001 || i.cutOff)
                .sort((a, b) => b.pressureDrop_mpa - a.pressureDrop_mpa)
                .slice(0, 30)
                .map((i) => {
                  const status = i.cutOff
                    ? { text: "🔴 Тасарсан", color: "var(--bp-red)" }
                    : !i.metAfter
                    ? { text: "🟡 Зөрчилт", color: "var(--bp-amber)" }
                    : i.pressureDrop_mpa > 0.01
                    ? { text: "🟠 Багасав", color: "var(--bp-amber)" }
                    : { text: "🟢 Хэвийн", color: "var(--bp-green)" };
                  return (
                    <tr key={i.consumerId}>
                      <Td>{i.consumerLabel}</Td>
                      <Td right>{i.baselinePressure_mpa.toFixed(3)}</Td>
                      <Td right>{i.failurePressure_mpa.toFixed(3)}</Td>
                      <Td right>{(i.pressureDrop_mpa * 1000).toFixed(1)}</Td>
                      <Td style={{ color: status.color, fontWeight: 600 }}>{status.text}</Td>
                    </tr>
                  );
                })}
              {simResult.impacts.filter((i) => i.pressureDrop_mpa > 0.001 || i.cutOff).length === 0 && (
                <tr>
                  <td colSpan={5} style={{ padding: "1rem", textAlign: "center", color: "var(--bp-green)" }}>
                    ✓ Бүх хэрэглэгч хэвийн ажиллана. Энэ элемент зайлшгүй биш.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      )}

      {/* Critical sweep result */}
      {criticalList && criticalList.length > 0 && (
        <section style={cardStyle}>
          <h4 style={{ marginTop: 0 }}>🔥 Хамгийн критик хоолойн топ-{criticalList.length}</h4>
          <p style={{ fontSize: 12, color: "var(--bp-text-3)", marginBottom: "0.75rem" }}>
            Эдгээр хоолой эвдэрвэл хамгийн их хэрэглэгчид нөлөөлнө. Шинээр дублексь шилжүүлэгч (loop, reservation) суулгахад анхаарах.
          </p>
          <table style={tableStyle}>
            <thead>
              <tr>
                <Th>№</Th>
                <Th>Хоолой</Th>
                <Th right>Алдагдал (кВт)</Th>
                <Th right>Нөлөөлсөн</Th>
                <Th right>Тасарсан</Th>
                <Th right>Impact оноо</Th>
              </tr>
            </thead>
            <tbody>
              {criticalList.map((row, i) => (
                <tr key={row.pipeId}>
                  <Td>{i + 1}</Td>
                  <Td style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>{row.pipeLabel}</Td>
                  <Td right style={{ color: row.cutOffCount > 0 ? "var(--bp-red)" : "var(--bp-text)" }}>
                    {row.impactScore > 1e6 ? (row.impactScore / 1000).toFixed(0) : "—"}
                  </Td>
                  <Td right>{row.affectedCount}</Td>
                  <Td right style={{ color: row.cutOffCount > 0 ? "var(--bp-red)" : "var(--bp-text-3)" }}>
                    {row.cutOffCount}
                  </Td>
                  <Td right>
                    <button
                      onClick={() => runOne(row.pipeId, "pipe")}
                      style={{ ...btnStyle, padding: "0.2rem 0.5rem", fontSize: 11 }}
                    >
                      🔍 Дэлгэрэнгүй
                    </button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: "ok" | "warn" | "alert" | "critical" }) {
  const color =
    tone === "critical" ? "var(--bp-red)" :
    tone === "alert" ? "#d97706" :
    tone === "warn" ? "var(--bp-amber)" :
    tone === "ok" ? "var(--bp-green)" :
    "var(--bp-text)";
  return (
    <div style={{ background: "var(--bp-bg)", border: "1px solid var(--bp-line-2)", borderRadius: 6, padding: "0.5rem 0.65rem" }}>
      <div className="hdr-mono" style={{ fontSize: 9 }}>{label}</div>
      <div style={{ fontSize: 16, fontFamily: "var(--font-mono)", fontWeight: 600, color }}>{value}</div>
    </div>
  );
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return <th style={{ padding: "0.4rem 0.6rem", textAlign: right ? "right" : "left", borderBottom: "1px solid var(--bp-line)", color: "var(--bp-text-3)", fontWeight: 600, fontSize: 11, textTransform: "uppercase" }}>{children}</th>;
}
function Td({ children, right, style }: { children: React.ReactNode; right?: boolean; style?: CSSProperties }) {
  return <td style={{ padding: "0.35rem 0.6rem", textAlign: right ? "right" : "left", borderBottom: "1px solid var(--bp-line-2)", color: "var(--bp-text)", ...style }}>{children}</td>;
}

const cardStyle: CSSProperties = {
  background: "var(--bp-bg-2)",
  border: "1px solid var(--bp-line)",
  borderRadius: 8,
  padding: "1rem",
  marginBottom: "1rem",
};

const selectStyle: CSSProperties = {
  width: "100%",
  padding: "0.45rem 0.55rem",
  fontSize: 12,
  background: "var(--bp-bg)",
  color: "var(--bp-text)",
  border: "1px solid var(--bp-line)",
  borderRadius: 4,
  fontFamily: "var(--font-mono)",
};

const btnStyle: CSSProperties = {
  padding: "0.5rem 0.85rem",
  fontSize: 13,
  background: "var(--bp-bg)",
  color: "var(--bp-text)",
  border: "1px solid var(--bp-line-2)",
  borderRadius: 4,
  cursor: "pointer",
  fontWeight: 500,
};

const tableStyle: CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 12,
};
