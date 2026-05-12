/**
 * DXF импорт хуудас — AutoCAD-аас гаргасан халаалтын схемийг хүлээн авах.
 * Хоёр хувилбар:
 *   1. Drag-drop / file-picker .dxf файл (browser-side parse)
 *   2. Бэлэн жишээ — Баянголын ам Гадна дулаан 2-2 (Ган-Кад ХХК 2022)
 */
import { useState, type DragEvent, type ChangeEvent } from "react";
import { useNavigate } from "react-router-dom";
import {
  importDxfText,
  importBayangolSample,
  type DxfImportResult,
} from "../lib/dxfImport";
import { api, HttpError } from "../lib/api";
import { storage } from "../lib/storage";
import { useAuthStore } from "../lib/authStore";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";

export function ImportDxf() {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<DxfImportResult | null>(null);
  const [filename, setFilename] = useState<string>("");
  const [heatingOnly, setHeatingOnly] = useState(true);
  const [defaultDn, setDefaultDn] = useState(100);
  const demoMode = useAuthStore((s) => s.demoMode);
  const nav = useNavigate();

  async function loadFile(file: File) {
    setBusy(true);
    setErr(null);
    setResult(null);
    setFilename(file.name);
    try {
      const text = await file.text();
      const r = await importDxfText(text, { heatingOnly, defaultDn });
      setResult(r);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Импорт амжилтгүй");
    } finally {
      setBusy(false);
    }
  }

  async function loadBayangol() {
    setBusy(true);
    setErr(null);
    setResult(null);
    setFilename("Баянголын ам Гадна дулаан 2-2 (жишээ).dxf");
    try {
      const r = await importBayangolSample();
      setResult(r);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Жишээ ачаалалт амжилтгүй");
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
    const baseName = filename.replace(/\.dxf$/i, "") || "Импорт-DXF";
    const name = `${baseName} (DXF)`;
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
          <h1 style={{ marginBottom: 4 }}>📐 AutoCAD .dxf импорт</h1>
          <p style={{ color: "var(--bp-text-2)", margin: 0 }}>
            AutoCAD-аас экспортолсон <code>.dxf</code> файл (DWG-ыг ODA File Converter-ээр DXF болгоно)
            эсвэл Hydra Calc дотор шууд татах боломжтой. Халаалтын layer-ыг автомат таних, шугам/камер/хэрэглэгчийг
            ялгана. Полилайнаас зангилаа, тойргоос камер, INSERT блок-аас тоног төхөөрөмж сэргээгдэнэ.
          </p>
        </header>

        {!result && (
          <Card style={{ marginBottom: "1rem" }}>
            <div style={{ display: "flex", gap: 12, marginBottom: "1rem" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
                <input
                  type="checkbox"
                  checked={heatingOnly}
                  onChange={(e) => setHeatingOnly(e.target.checked)}
                />
                Зөвхөн халаалтын layer
                <span style={{ color: "var(--bp-text-3)", fontSize: 11 }}>(dulan / heat)</span>
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
                Үндсэн DN:
                <select
                  value={defaultDn}
                  onChange={(e) => setDefaultDn(Number(e.target.value))}
                  style={{ padding: "0.25rem 0.4rem", fontFamily: "var(--font-mono)" }}
                >
                  {[25, 32, 40, 50, 65, 80, 100, 125, 150, 200, 250, 300].map((d) => (
                    <option key={d} value={d}>DN{d}</option>
                  ))}
                </select>
              </label>
            </div>
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
              <div style={{ fontSize: 48, marginBottom: "1rem", color: "var(--bp-blue)" }}>📐</div>
              <h3 style={{ marginBottom: "0.5rem" }}>
                {busy ? "DXF уншиж байна..." : ".dxf файлаа энд чирж тавь"}
              </h3>
              <p style={{ fontSize: 13, color: "var(--bp-text-3)", marginBottom: "1.5rem" }}>
                эсвэл сонго:
              </p>
              <input
                type="file"
                accept=".dxf"
                onChange={onPick}
                disabled={busy}
                style={{ display: "none" }}
                id="dxf-file"
              />
              <label htmlFor="dxf-file">
                <Button size="lg" disabled={busy}>📁 .dxf сонгох</Button>
              </label>
              <div style={{ marginTop: "1.5rem", display: "flex", gap: 6, justifyContent: "center", flexWrap: "wrap" }}>
                <span style={{ fontSize: 12, color: "var(--bp-text-3)", alignSelf: "center" }}>Эсвэл бэлэн жишээ:</span>
                <Button size="sm" variant="ghost" onClick={loadBayangol} disabled={busy}>
                  🏗 Баянгол 2-2 (Ган-Кад 2022)
                </Button>
              </div>
              <p style={{ marginTop: "1rem", fontSize: 11, color: "var(--bp-text-3)" }}>
                💡 DWG файлыг DXF болгох хэрэгтэй бол: AutoCAD → &quot;Save As&quot; → AutoCAD 2018 DXF (*.dxf)
                <br />
                Эсвэл үнэгүй ODA File Converter ашиглан хөрвүүл (winget install ODA.ODAFileConverter).
              </p>
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
              <h3 style={{ marginTop: 0 }}>✓ DXF амжилттай хөрвөв — {filename}</h3>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                  gap: 10,
                  marginBottom: "1rem",
                }}
              >
                <Stat label="Хоолой" value={result.stats.pipes} />
                <Stat label="Зангилаа" value={result.stats.nodes} />
                <Stat label="Камер" value={result.stats.chambers} />
                <Stat label="Хэрэглэгч" value={result.stats.consumers} />
                <Stat label="Эх үүсвэр" value={result.stats.sources} />
                <Stat label="Уулзвар" value={result.stats.junctions} />
                <Stat label="Σ урт" value={`${result.stats.totalLength_m.toFixed(0)} м`} />
                <Stat label="Layers" value={result.stats.layers} />
              </div>
              <p style={{ fontSize: 12, color: "var(--bp-text-3)", margin: "0.5rem 0" }}>
                Bbox: {(result.bbox.maxX - result.bbox.minX).toFixed(0)}м × {(result.bbox.maxY - result.bbox.minY).toFixed(0)}м (бодит хэмжээ)
              </p>
              {result.warnings.length > 0 && (
                <details>
                  <summary style={{ cursor: "pointer", color: "var(--bp-amber)" }}>
                    ⚠ {result.warnings.length} анхааруулга
                  </summary>
                  <ul style={{ fontSize: 12, color: "var(--bp-text-2)" }}>
                    {result.warnings.map((w, i) => <li key={i}>{w}</li>)}
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
              <details open>
                <summary style={{ cursor: "pointer", fontWeight: 600 }}>Эхний 10 зангилаа preview</summary>
                <table style={{ width: "100%", marginTop: "0.75rem", fontSize: 12, fontFamily: "var(--font-mono)", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--bp-line)" }}>
                      <th style={{ textAlign: "left", padding: 4 }}>ID</th>
                      <th style={{ textAlign: "left", padding: 4 }}>Нэр</th>
                      <th style={{ textAlign: "left", padding: 4 }}>Төрөл</th>
                      <th style={{ textAlign: "right", padding: 4 }}>X (px)</th>
                      <th style={{ textAlign: "right", padding: 4 }}>Y (px)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.state.nodes.slice(0, 10).map((n) => (
                      <tr key={n.id} style={{ borderBottom: "1px solid var(--bp-line)" }}>
                        <td style={{ padding: 4, color: "var(--bp-text-3)" }}>{n.id}</td>
                        <td style={{ padding: 4 }}>{n.label}</td>
                        <td style={{ padding: 4, color: "var(--bp-blue)" }}>{n.kind}</td>
                        <td style={{ padding: 4, textAlign: "right" }}>{n.x}</td>
                        <td style={{ padding: 4, textAlign: "right" }}>{n.y}</td>
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
