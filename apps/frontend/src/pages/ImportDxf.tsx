/**
 * DXF импорт хуудас — AutoCAD-аас гаргасан халаалтын схемийг хүлээн авах.
 * Хоёр хувилбар:
 *   1. Drag-drop / file-picker .dxf файл (browser-side parse)
 *   2. Бэлэн жишээ — Баянголын ам Гадна дулаан 2-2 (Ган-Кад ХХК 2022)
 */
import { useCallback, useState, type DragEvent, type ChangeEvent } from "react";
import { useNavigate } from "react-router-dom";
import {
  importDxfBytes,
  importDxfJson,
  importBayangolSample,
  type DxfImportResult,
  type ExtractedDxf,
} from "../lib/dxfImport";
import { api, HttpError } from "../lib/api";
import { storage } from "../lib/storage";
import { useAuthStore } from "../lib/authStore";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { ImportReviewPanel, type ImportOverrides } from "../components/hydraulic/import/ImportReviewPanel";
import type { UndoSnapshot } from "../components/hydraulic/hydraulicTypes";

export function ImportDxf() {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<DxfImportResult | null>(null);
  /** Phase 7.4 — keep the original ExtractedDxf so the review pane
   *  can re-run the importer with overrides without re-parsing the
   *  raw DXF text. */
  const [extracted, setExtracted] = useState<ExtractedDxf | null>(null);
  /** Phase 7.4 — gate the editor-navigation step. After parse the
   *  engineer sees the review pane; on Confirm we commit + navigate. */
  const [reviewing, setReviewing] = useState(false);
  const [filename, setFilename] = useState<string>("");
  const [heatingOnly, setHeatingOnly] = useState(true);
  const [defaultDn, setDefaultDn] = useState(100);
  const demoMode = useAuthStore((s) => s.demoMode);
  const nav = useNavigate();

  async function loadFile(file: File) {
    setBusy(true);
    setErr(null);
    setResult(null);
    setExtracted(null);
    setReviewing(false);
    setFilename(file.name);
    try {
      // Phase 7.1 — use the bytes path so the CP1251 sniffer can run.
      // Mongolian / older Russian AutoCAD output is frequently CP1251
      // and would mojibake through plain `file.text()`.
      const buffer = await file.arrayBuffer();
      const r = await importDxfBytes(buffer, { heatingOnly, defaultDn });
      setResult(r);
      // We don't have the ExtractedDxf back from importDxfBytes
      // because that path re-extracts inside importDxfText. For
      // file-uploaded DXFs the engineer's override re-parse will
      // skip the cheap path and re-run the importer on the original
      // bytes; this is still fast (~50ms on Bayangol). Phase 11
      // could expose ExtractedDxf through importDxfBytes if needed.
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
    setExtracted(null);
    setReviewing(false);
    setFilename("Баянголын ам Гадна дулаан 2-2 (жишээ).dxf");
    try {
      // For the bundled sample we have the ExtractedDxf directly —
      // grab it so the review-pane re-parse is essentially free.
      const r = await fetch("/dxf-samples/bayangol-2-2.json");
      const json = (await r.json()) as ExtractedDxf;
      setExtracted(json);
      setResult(importDxfJson(json, { heatingOnly: true, defaultDn }));
    } catch (e) {
      // Fall through to the legacy path if the JSON fetch fails.
      try {
        setResult(await importBayangolSample());
      } catch (e2) {
        setErr(e2 instanceof Error ? e2.message : "Жишээ ачаалалт амжилтгүй");
      }
      void e;
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

  /**
   * Phase 7.4 — re-run the importer with engineer overrides. Used
   * by the review pane to produce a live preview. Only callable
   * when we have the original ExtractedDxf in state (e.g. Bayangol
   * preset). For file uploads `extracted` is null so the pane uses
   * the original parseResult as a static preview.
   */
  const recomputeWithOverrides = useCallback(
    (overrides: ImportOverrides): DxfImportResult => {
      if (!extracted) return result!;
      return importDxfJson(extracted, {
        heatingOnly,
        defaultDn,
        blockAliasOverrides: overrides.blockAliases,
        layerCircuitOverrides: overrides.layerCircuits,
      });
    },
    [extracted, heatingOnly, defaultDn, result],
  );

  /**
   * Phase 7.4 — commit step. Prepends a single empty-state
   * UndoSnapshot to the project so engineer can Ctrl+Z in the
   * editor to restore the pre-import (empty) state. The label
   * surfaces as "DXF импортолсон" in the undo toast.
   */
  async function commitImport(finalResult: DxfImportResult) {
    const baseName = filename.replace(/\.dxf$/i, "") || "Импорт-DXF";
    const name = `${baseName} (DXF)`;
    const importedNodeCount = finalResult.state.nodes.length;
    const importedPipeCount = finalResult.state.pipes.length;
    const preImportSnapshot: UndoSnapshot = {
      label: "DXF импортолсон",
      affectedCount: importedNodeCount + importedPipeCount,
      nodes: [],
      pipes: [],
      selection: null,
      multiSelection: {
        nodeIds: [],
        pipeIds: [],
        dimensionIds: [],
        constructionLineIds: [],
        annotationIds: [],
        buildingIds: [],
      },
      dimensions: [],
      constructionLines: [],
      annotations: [],
      buildings: [],
    };
    const stateWithUndo = {
      ...finalResult.state,
      undoStack: [preImportSnapshot],
    };
    try {
      if (demoMode) {
        await storage.set(`project:${name}`, JSON.stringify(stateWithUndo));
        nav(`/app/${encodeURIComponent(name)}`);
      } else {
        const created = await api.post<{ id: string }>("/projects", { name, data: stateWithUndo });
        nav(`/app/${created.id}`);
      }
    } catch (e) {
      alert(e instanceof HttpError ? e.message : "Хадгалж чадсангүй");
    }
  }

  /** Legacy: direct commit without the review pane (kept on the
   *  "Хадгалж editor нээх" button as a one-click shortcut). */
  async function saveProject() {
    if (!result) return;
    await commitImport(result);
  }

  /** Phase 7.4 — open the review pane. */
  function openReview() {
    if (!result) return;
    setReviewing(true);
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
              <div style={{ display: "flex", gap: 8, marginTop: "1.5rem", flexWrap: "wrap" }}>
                <Button onClick={openReview} size="lg" data-testid="open-review">
                  🔍 Review хийх + хадгалах
                </Button>
                <Button variant="secondary" onClick={saveProject} data-testid="quick-commit">
                  💾 Шууд хадгалах
                </Button>
                <Button variant="secondary" onClick={() => { setResult(null); setExtracted(null); setReviewing(false); setFilename(""); }}>
                  Дахин эхлэх
                </Button>
              </div>
            </Card>

            {/* Phase 7.4 — review pane (between parse and commit) */}
            {reviewing && (
              <Card style={{ marginBottom: "1rem" }}>
                <ImportReviewPanel
                  parseResult={result}
                  {...(extracted ? { extracted } : {})}
                  {...(extracted ? { recompute: recomputeWithOverrides } : {})}
                  onConfirm={(_overrides, livePreview) => {
                    void commitImport(livePreview);
                  }}
                  onCancel={() => setReviewing(false)}
                />
              </Card>
            )}

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
