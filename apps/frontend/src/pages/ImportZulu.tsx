/**
 * Zulu .sqlite import page — drag/drop a Zulu Thermo project file → preview → save.
 */
import { useState, type DragEvent, type ChangeEvent } from "react";
import { useNavigate } from "react-router-dom";
import { importZuluSqlite, type ZuluImportResult } from "../lib/zuluImport";
import { api, HttpError } from "../lib/api";
import { storage } from "../lib/storage";
import { useAuthStore } from "../lib/authStore";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";

export function ImportZulu() {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<ZuluImportResult | null>(null);
  const [filename, setFilename] = useState<string>("");
  const demoMode = useAuthStore((s) => s.demoMode);
  const nav = useNavigate();

  async function loadFile(file: File) {
    setBusy(true);
    setErr(null);
    setResult(null);
    setFilename(file.name);
    try {
      const buf = await file.arrayBuffer();
      const r = await importZuluSqlite(buf);
      setResult(r);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Импорт амжилтгүй");
    } finally {
      setBusy(false);
    }
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) void loadFile(f);
  };

  const onPick = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) void loadFile(f);
  };

  async function saveProject() {
    if (!result) return;
    const name = filename.replace(/\.sqlite$/i, "") || "Импорт-Zulu";
    try {
      if (demoMode) {
        await storage.set(`project:${name}`, JSON.stringify(result.state));
        nav(`/app/${encodeURIComponent(name)}`);
      } else {
        const created = await api.post<{ id: string }>("/projects", { name, data: result.state });
        nav(`/app/${created.id}`);
      }
    } catch (e) {
      alert(e instanceof HttpError ? e.message : "Хадгалж чадсангүй");
    }
  }

  return (
    <div style={{ padding: "2rem 0", minHeight: "calc(100vh - 58px)" }}>
      <div className="container" style={{ maxWidth: 880 }}>
        <header style={{ marginBottom: "1.5rem" }}>
          <h1 style={{ marginBottom: 4 }}>Hydro .sqlite импорт</h1>
          <p style={{ color: "var(--bp-text-2)", margin: 0 }}>
            Zulu Thermo desktop эсвэл Hydro форматтай <code>.sqlite</code> файлыг шууд татаж манай систем-д ашигла.
            10 хүснэгт (эх үүсвэр, камер, ДДС, оруулга, насос, регулятор, хаалт, гүүрэн, шугам, тулгуур) бүгд автоматаар уншигдана.
          </p>
        </header>

        {!result && (
          <Card>
            <div
              onDrop={onDrop}
              onDragOver={(e) => e.preventDefault()}
              style={{
                border: "2px dashed var(--bp-line-2)",
                borderRadius: 12,
                padding: "3rem 1.5rem",
                textAlign: "center",
                background: "var(--bp-bg)",
              }}
            >
              <div style={{ fontSize: 48, marginBottom: "1rem", color: "var(--bp-blue)" }}>📂</div>
              <h3 style={{ marginBottom: "0.5rem" }}>
                {busy ? "Уншиж байна..." : "Файлаа энд чирж тавь"}
              </h3>
              <p style={{ fontSize: 14, color: "var(--bp-text-3)", marginBottom: "1.5rem" }}>
                эсвэл сонго:
              </p>
              <input
                type="file"
                accept=".sqlite,.db,.sqlite3"
                onChange={onPick}
                disabled={busy}
                style={{ display: "none" }}
                id="zulu-file"
              />
              <label htmlFor="zulu-file">
                <Button size="lg" disabled={busy}>📁 Файл сонгох</Button>
              </label>
              <div style={{ marginTop: "1.5rem", display: "flex", gap: 6, justifyContent: "center", flexWrap: "wrap" }}>
                <span style={{ fontSize: 12, color: "var(--bp-text-3)", alignSelf: "center" }}>Эсвэл бэлэн жишээ:</span>
                {[
                  { name: "Магистраль", url: "/zulu-samples/Magistral.sqlite" },
                  { name: "ЦТП Лен", url: "/zulu-samples/Ctp.sqlite" },
                  { name: "Насос станц", url: "/zulu-samples/Nasos.sqlite" },
                ].map((s) => (
                  <Button
                    key={s.url}
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      const res = await fetch(s.url);
                      const blob = await res.blob();
                      const file = new File([blob], `${s.name}.sqlite`, { type: "application/x-sqlite3" });
                      void loadFile(file);
                    }}
                  >
                    🧪 {s.name}
                  </Button>
                ))}
              </div>
            </div>
          </Card>
        )}

        {err && (
          <div
            style={{
              marginTop: "1rem",
              padding: "1rem",
              background: "var(--bp-red-soft)",
              border: "1px solid var(--bp-red)",
              borderRadius: 8,
              color: "var(--bp-red)",
            }}
          >
            ⚠ {err}
          </div>
        )}

        {result && (
          <>
            <Card style={{ marginBottom: "1rem" }}>
              <h3 style={{ marginTop: 0 }}>✓ Импорт амжилттай — {filename}</h3>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                  gap: 10,
                  marginBottom: "1rem",
                }}
              >
                <Stat label="Эх үүсвэр" value={result.stats.sources} />
                <Stat label="ЦТП" value={result.stats.substations} />
                <Stat label="Хэрэглэгч" value={result.stats.consumers} />
                <Stat label="Камер" value={result.stats.junctions} />
                <Stat label="Насос" value={result.stats.pumps} />
                <Stat label="Арматур" value={result.stats.valves} />
                <Stat label="Хоолой" value={result.stats.pipes} />
                <Stat label="Σ ачаалал" value={`${(result.stats.totalLoad_kW / 1000).toFixed(1)} МВт`} />
              </div>
              {result.warnings.length > 0 && (
                <details>
                  <summary style={{ cursor: "pointer", color: "var(--bp-amber)" }}>
                    ⚠ {result.warnings.length} анхааруулга
                  </summary>
                  <ul style={{ fontSize: 12, color: "var(--bp-text-2)" }}>
                    {result.warnings.slice(0, 20).map((w, i) => <li key={i}>{w}</li>)}
                  </ul>
                </details>
              )}
              <div style={{ display: "flex", gap: 8, marginTop: "1.5rem" }}>
                <Button onClick={saveProject} size="lg">💾 Хадгалж editor нээх</Button>
                <Button variant="secondary" onClick={() => { setResult(null); setFilename(""); }}>
                  Дахин эхлэх
                </Button>
              </div>
            </Card>

            <Card>
              <details>
                <summary style={{ cursor: "pointer", fontWeight: 600 }}>Эхний 5 зангилаа preview</summary>
                <table style={{ width: "100%", marginTop: "0.75rem", fontSize: 12, fontFamily: "var(--font-mono)", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--bp-line)" }}>
                      <th style={{ textAlign: "left", padding: 4 }}>Нэр</th>
                      <th style={{ textAlign: "left", padding: 4 }}>Төрөл</th>
                      <th style={{ textAlign: "right", padding: 4 }}>Q (кВт)</th>
                      <th style={{ textAlign: "right", padding: 4 }}>H_geo (м)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.state.nodes.slice(0, 10).map((n) => (
                      <tr key={n.id} style={{ borderBottom: "1px solid var(--bp-line)" }}>
                        <td style={{ padding: 4 }}>{n.label}</td>
                        <td style={{ padding: 4, color: "var(--bp-text-3)" }}>{n.kind}</td>
                        <td style={{ padding: 4, textAlign: "right" }}>{n.heatLoad_w ? (n.heatLoad_w / 1000).toFixed(0) : "—"}</td>
                        <td style={{ padding: 4, textAlign: "right" }}>{n.elevation_m?.toFixed(2) ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={{ background: "var(--bp-bg)", border: "1px solid var(--bp-line-2)", borderRadius: 6, padding: "0.6rem 0.75rem" }}>
      <div className="hdr-mono" style={{ fontSize: 9 }}>{label}</div>
      <div style={{ fontSize: 18, fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--bp-blue)" }}>{value}</div>
    </div>
  );
}
