import { lazy, Suspense, useEffect, useState, useCallback, type CSSProperties, type ReactNode } from "react";
import { ErrorBoundary } from "./ErrorBoundary";
import { useHydraulicStore, snapshotForSave } from "./hydraulicStore";
import { emptyState, type HydraulicState } from "./hydraulicTypes";
import { checkNorms } from "./calc/normCheck";
import { runThreeMode, type CalcMode } from "./calc/threeModeEngine";
import { hasLoops } from "./calc/loopSolver";
import { writeBackResults } from "./calc/writeBack";
import { SchemeEditor } from "./panels/SchemeEditor";
import { InspectorPanel } from "./panels/InspectorPanel";
import {
  DEFAULT_SCALE,
  DEFAULT_PAPER_SIZE,
  DEFAULT_PAPER_ORIENTATION,
} from "./scheme/scales";
import { api, HttpError } from "../../lib/api";
import { useAuthStore } from "../../lib/authStore";
import { storage } from "../../lib/storage";

// Lazy-loaded tabs + modals — keep the initial editor bundle as small as
// possible. The SchemeEditor canvas is the only thing the user sees on
// mount; everything else (Үр дүн, Пьезометр, Тэнцвэржүүлэлт, Эвдрэлийн
// загвар, Смет, Тохиргоо, ИТП picker) loads when its tab/button is clicked.
// Suspense fallback (TabLoading) shows during the chunk download.
// Piezometric tab now uses the new PiezometricView (computes via the
// dedicated calc/piezometric.ts module — replaces the older inline
// DFS-based PiezometricChart). Keeping the local binding name
// "PiezometricChart" so the JSX dispatch in the tab switcher below
// doesn't need touching.
const PiezometricChart = lazy(() => import("./panels/PiezometricView").then((m) => ({ default: m.PiezometricView })));
const BalancingPanel = lazy(() => import("./panels/BalancingPanel").then((m) => ({ default: m.BalancingPanel })));
const FailurePanel = lazy(() => import("./panels/FailurePanel").then((m) => ({ default: m.FailurePanel })));
const BomPanel = lazy(() => import("./panels/BomPanel").then((m) => ({ default: m.BomPanel })));
const ResultsPanel = lazy(() => import("./panels/ResultsPanel").then((m) => ({ default: m.ResultsPanel })));
const SettingsPanel = lazy(() => import("./panels/SettingsPanel").then((m) => ({ default: m.SettingsPanel })));
const ItpSchemePicker = lazy(() => import("./panels/ItpSchemePicker").then((m) => ({ default: m.ItpSchemePicker })));
// Phase 8.1 — Longitudinal profile (first of 5 detail views).
const LongitudinalProfile = lazy(() => import("./panels/LongitudinalProfile").then((m) => ({ default: m.LongitudinalProfile })));
// Phase 8.2 — Energy schemes (heat-balance view).
const EnergySchemes = lazy(() => import("./panels/EnergySchemes").then((m) => ({ default: m.EnergySchemes })));
// Phase 8.3 — Well / chamber cross-section detail.
const WellDetail = lazy(() => import("./panels/WellDetail").then((m) => ({ default: m.WellDetail })));
// Phase 8.4 — Compensator detail.
const CompensatorDetail = lazy(() => import("./panels/CompensatorDetail").then((m) => ({ default: m.CompensatorDetail })));
// Phase 8.5 — УДДТ P&ID.
const UddtPid = lazy(() => import("./panels/UddtPid").then((m) => ({ default: m.UddtPid })));
// Phase 9.1 — Compliance check (30+ БНбД rules).
const ComplianceView = lazy(() => import("./panels/ComplianceView").then((m) => ({ default: m.ComplianceView })));
// Phase 10.3 — Share dialog (create + revoke read-only links).
const ShareDialog = lazy(() => import("./dialogs/ShareDialog").then((m) => ({ default: m.ShareDialog })));

interface Props {
  projectId?: string;
  readOnly?: boolean;
  sharedData?: unknown;
}

type Tab =
  | "scheme"
  | "results"
  | "piezo"
  | "balancing"
  | "failure"
  | "bom"
  | "settings"
  // Phase 8 — Detail-view cluster. Adds 5 sub-phase tabs over time:
  //   8.1 ✓ "profile"       — longitudinal profile
  //   8.2 ✓ "energy"        — energy / heat-balance scheme
  //   8.3 ✓ "well"          — ҮХТ chamber cross-section
  //   8.4 ✓ "compensator"   — compensator detail
  //   8.5 ✓ "pid"           — УДДТ P&ID
  | "profile"
  | "energy"
  | "well"
  | "compensator"
  | "pid"
  // Phase 9.1 — Compliance check (separate cluster: stands apart
  // from drawing details since it's project-wide verification).
  | "compliance";

export function HydraulicV5(props: Props) {
  return (
    <ErrorBoundary>
      <HydraulicInner {...props} />
    </ErrorBoundary>
  );
}

function HydraulicInner({ projectId, readOnly = false, sharedData }: Props) {
  const [tab, setTab] = useState<Tab>("scheme");
  const [calcMode, setCalcMode] = useState<CalcMode>("verification");
  const [calcReport, setCalcReport] = useState<string[]>([]);
  const [showItpPicker, setShowItpPicker] = useState(false);
  const updateNodeAction = useHydraulicStore((s) => s.updateNode);
  const selection = useHydraulicStore((s) => s.selection);
  const [projectName, setProjectName] = useState<string>(
    projectId ? "" : `Төсөл ${new Date().toISOString().slice(0, 10)}`,
  );
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const reset = useHydraulicStore((s) => s.reset);
  const setResults = useHydraulicStore((s) => s.setResults);
  const state = useHydraulicStore((s) => s);
  const demoMode = useAuthStore((s) => s.demoMode);
  const looped = hasLoops(state.nodes, state.pipes);

  // Load project from server, localStorage (demo), or from sharedData
  useEffect(() => {
    if (sharedData) {
      reset(sharedData as HydraulicState);
      return;
    }
    if (!projectId) {
      reset(emptyState());
      return;
    }
    (async () => {
      try {
        if (demoMode) {
          const entry = await storage.get(`project:${projectId}`);
          if (entry) {
            setProjectName(projectId);
            setLoadedId(projectId);
            reset(JSON.parse(entry.value) as HydraulicState);
          } else {
            reset(emptyState());
          }
          return;
        }
        const res = await api.get<{ id: string; name: string; data: HydraulicState }>(`/projects/${projectId}`);
        setProjectName(res.name);
        setLoadedId(res.id);
        reset(res.data);
      } catch (err) {
        console.error("load failed", err);
      }
    })();
  }, [projectId, reset, sharedData, demoMode]);

  const compute = useCallback(() => {
    const s = useHydraulicStore.getState();
    const out = runThreeMode(s.nodes, s.pipes, s.settings, { mode: calcMode });
    const violations = checkNorms(s.nodes, s.pipes, out.hydraulic, s.settings);
    // Zulu-style write-back: mutate node + pipe in place with result_* fields
    writeBackResults(s.nodes, s.pipes, out.hydraulic, s.settings);
    setResults(out.hydraulic, violations);
    setCalcReport(out.report);
    setTab(calcMode === "commissioning" ? "balancing" : "results");
  }, [setResults, calcMode]);

  const save = useCallback(async () => {
    if (readOnly) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      const snapshot = snapshotForSave(useHydraulicStore.getState());

      if (demoMode) {
        await storage.set(`project:${projectName}`, JSON.stringify(snapshot));
        setLoadedId(projectName);
        history.replaceState(null, "", `/app/${encodeURIComponent(projectName)}`);
        setSaveMsg("✓ Хадгалсан (local)");
        setTimeout(() => setSaveMsg(null), 2000);
        return;
      }

      const payload = { name: projectName, data: snapshot };
      if (loadedId) {
        await api.put(`/projects/${loadedId}`, payload);
      } else {
        const created = await api.post<{ id: string }>("/projects", payload);
        setLoadedId(created.id);
        history.replaceState(null, "", `/app/${created.id}`);
      }
      setSaveMsg("✓ Хадгалсан");
      setTimeout(() => setSaveMsg(null), 2000);
    } catch (err) {
      setSaveMsg(err instanceof HttpError ? `⚠ ${err.message}` : "⚠ Хадгалж чадсангүй");
    } finally {
      setSaving(false);
    }
  }, [loadedId, projectName, readOnly, demoMode]);

  // Export functions use dynamic imports — xlsx (~150 KB) and the DXF/Zulu
  // exporters together add ~200 KB to the bundle. By loading them only on
  // button click, the initial editor stays lean.
  const exportXlsx = useCallback(async () => {
    const { exportToExcel } = await import("./export/excelExport");
    exportToExcel(snapshotForSave(useHydraulicStore.getState()), `${projectName || "hydra"}.xlsx`);
  }, [projectName]);

  const exportDxf = useCallback(async () => {
    const { downloadDXF } = await import("./export/dxfExport");
    downloadDXF(snapshotForSave(useHydraulicStore.getState()), `${projectName || "hydra"}.dxf`);
  }, [projectName]);

  const exportZulu = useCallback(async () => {
    try {
      const { exportToZuluSqlite, downloadAsBlob } = await import("../../lib/zuluExport");
      const data = await exportToZuluSqlite(snapshotForSave(useHydraulicStore.getState()), { prefix: "Teplo" });
      downloadAsBlob(data, `${projectName || "hydra"}.sqlite`);
    } catch (e) {
      alert(`Zulu export алдаа: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, [projectName]);

  // Phase 6.7.4 — PDF export (headline feature). Dynamic-imported
  // so the jspdf + svg2pdf + Roboto Cyrillic font stack (~120 KB gz)
  // sits in a lazy chunk that's downloaded only on first PDF click.
  //
  // Phase 6.8.4 (BUG C) — production silent-failure report traced to
  // two paths that didn't yell loud enough:
  //   1. The blob may be created, anchor click fires, but on some
  //      browser/OS combos the download is silently blocked OR the
  //      file lands in a non-default folder. Engineers had no
  //      confirmation either way.
  //   2. svg2pdf occasionally rejects on a font-loading race; the
  //      catch logged via `alert()`, but if the user dismissed the
  //      alert too fast (or it was suppressed by a popup blocker
  //      extension) they thought the button "did nothing".
  // Fix: explicit `console.info` markers at every step + a
  // user-visible success/error alert with a precise filename in the
  // confirmation copy. The catch path also logs the full error to
  // the console so devs can grab the stack trace on bug reports.
  const exportPdf = useCallback(async () => {
    // eslint-disable-next-line no-console
    console.info("[pdf-export] start");
    try {
      const svgEl = document.querySelector<SVGSVGElement>(
        '[data-testid="scheme-canvas"]',
      );
      if (!svgEl) {
        // eslint-disable-next-line no-console
        console.warn("[pdf-export] scheme-canvas element not found");
        alert("PDF үүсгэх боломжгүй — Схем таб дээр шилжээд дахин оролдоно уу.");
        return;
      }
      // eslint-disable-next-line no-console
      console.info("[pdf-export] svg ok, loading pdf chunk…");
      const { exportToPdf } = await import("./export/pdfExport");
      const s = useHydraulicStore.getState();
      // eslint-disable-next-line no-console
      console.info("[pdf-export] rendering pdf…");
      const blob = await exportToPdf({
        state: s,
        settings: s.settings,
        paperSize: s.settings.printPaperSize ?? DEFAULT_PAPER_SIZE,
        orientation: s.settings.printOrientation ?? DEFAULT_PAPER_ORIENTATION,
        scale: s.settings.printScale ?? DEFAULT_SCALE,
        svgElement: svgEl,
      });
      if (!blob || blob.size === 0) {
        // eslint-disable-next-line no-console
        console.error("[pdf-export] blob empty — refusing to download");
        alert("PDF үүсгэж чадсангүй: гарсан файл хоосон байна. Console-ыг шалгана уу.");
        return;
      }
      const filename = `${projectName || "hydra"}.pdf`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      // Free the blob URL after the click has triggered. Some
      // browsers need a brief tick before revoke is safe.
      setTimeout(() => URL.revokeObjectURL(url), 250);
      // eslint-disable-next-line no-console
      console.info(`[pdf-export] done → ${filename} (${blob.size} bytes)`);
      // Explicit user-visible confirmation. Same `alert()` pathway as
      // the error branch so popup blockers / overlay extensions
      // affect both equally — engineer gets ONE consistent signal
      // either way.
      alert(`PDF татагдлаа: ${filename}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // eslint-disable-next-line no-console
      console.error("[pdf-export] failed:", e);
      alert(`PDF үүсгэж чадсангүй: ${msg}`);
    }
  }, [projectName]);

  /** Phase 8.6 — Multi-page drawing set export.
   *
   *  Generates a 6-page A3 / A4 PDF: Plan (live SVG) → Profile →
   *  Energy → Well → Compensator → P&ID. Each detail page is drawn
   *  via jsPDF primitives — no DOM round-trip — so the engineer
   *  doesn't need to visit every tab before exporting. The Plan page
   *  still requires the Scheme tab's SVG to be mounted; if the
   *  engineer is on a different tab when they hit Drawing Set, the
   *  bundle just skips page 1 with a friendly warning. */
  const exportDrawingSet = useCallback(async () => {
    // eslint-disable-next-line no-console
    console.info("[drawing-set] start");
    try {
      const svgEl = document.querySelector<SVGSVGElement>('[data-testid="scheme-canvas"]');
      if (!svgEl) {
        // eslint-disable-next-line no-console
        console.warn("[drawing-set] scheme-canvas missing — proceeding without Plan page");
      }
      const { exportDrawingSetPdf } = await import("./export/pdfExport");
      const s = useHydraulicStore.getState();
      const blob = await exportDrawingSetPdf({
        state: s,
        settings: s.settings,
        paperSize: s.settings.printPaperSize ?? DEFAULT_PAPER_SIZE,
        orientation: s.settings.printOrientation ?? DEFAULT_PAPER_ORIENTATION,
        scale: s.settings.printScale ?? DEFAULT_SCALE,
        svgElement: svgEl,
        results: s.results ?? undefined,
        selection: s.selection ?? null,
      });
      if (!blob || blob.size === 0) {
        // eslint-disable-next-line no-console
        console.error("[drawing-set] blob empty");
        alert("Drawing Set үүсгэж чадсангүй: гарсан файл хоосон байна.");
        return;
      }
      const filename = `${projectName || "hydra"}-drawing-set.pdf`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 250);
      // eslint-disable-next-line no-console
      console.info(`[drawing-set] done → ${filename} (${blob.size} bytes)`);
      alert(`Drawing Set татагдлаа: ${filename}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // eslint-disable-next-line no-console
      console.error("[drawing-set] failed:", e);
      alert(`Drawing Set үүсгэж чадсангүй: ${msg}`);
    }
  }, [projectName]);

  /** Phase 6.7.4 — "Quick preview" via the browser's native print
   *  dialog. Engineer can save-to-PDF via the OS dialog if they
   *  don't want the in-app PDF export. CSS in <style> below hides
   *  the UI chrome during print. */
  const quickPrintPreview = useCallback(() => {
    window.print();
  }, []);

  /** Phase 10.3 — Share dialog state. Replaces the Phase 6.x one-shot
   *  alert flow with a proper modal listing existing tokens + revoke. */
  const [showShareDialog, setShowShareDialog] = useState(false);
  const share = useCallback(() => {
    if (demoMode) {
      alert("Demo горимд хуваалцах байхгүй — жинхэнэ нэвтрэлт хийнэ үү.");
      return;
    }
    if (!loadedId) {
      alert("Хуваалцахын өмнө төслийг хадгалаарай.");
      return;
    }
    setShowShareDialog(true);
  }, [loadedId, demoMode]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Phase 6.7.4 — @media print CSS. When the engineer triggers
          "Preview" the OS print dialog opens; we want only the
          scheme canvas (no toolbar / no tabs / no panels) on the
          printed page. The PDF export path (🖨 PDF) bypasses this
          entirely — it renders straight into a jsPDF Blob. */}
      <style>{`
        @media print {
          @page { margin: 10mm; }
          body { background: white !important; }
          header,
          aside,
          [data-testid="layer-panel"],
          [data-testid="batch-ops-toolbar"] {
            display: none !important;
          }
          [data-testid="scheme-canvas"] {
            width: 100% !important;
            height: auto !important;
          }
        }
      `}</style>
      {/* Top toolbar */}
      <header
        style={{
          borderBottom: "1px solid var(--border-soft)",
          background: "var(--bg-soft)",
          padding: "0.5rem 0.85rem",
          display: "flex",
          alignItems: "center",
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        <input
          value={projectName}
          onChange={(e) => setProjectName(e.target.value)}
          disabled={readOnly}
          style={{
            background: "var(--bg)",
            color: "var(--fg)",
            border: "1px solid var(--border)",
            borderRadius: 6,
            padding: "0.35rem 0.6rem",
            fontSize: 14,
            fontWeight: 600,
            minWidth: 220,
          }}
          placeholder="Төслийн нэр"
        />

        <TabBtn active={tab === "scheme"} onClick={() => setTab("scheme")}>Схем</TabBtn>
        <TabBtn active={tab === "results"} onClick={() => setTab("results")}>Үр дүн</TabBtn>
        <TabBtn active={tab === "piezo"} onClick={() => setTab("piezo")}>📈 Пьезометр</TabBtn>
        <TabBtn active={tab === "balancing"} onClick={() => setTab("balancing")}>⚖ Тэнцвэржүүлэлт</TabBtn>
        <TabBtn active={tab === "failure"} onClick={() => setTab("failure")}>🚨 Эвдрэлийн загвар</TabBtn>
        <TabBtn active={tab === "bom"} onClick={() => setTab("bom")}>💰 Смет</TabBtn>
        {/* Phase 8 — visual divider between Plan-cluster (above) and
            Detail-cluster (below). Helps the engineer mental-model
            why some tabs feel "side views" and others "analysis". */}
        <span aria-hidden style={tabDivider}>|</span>
        <TabBtn active={tab === "profile"} onClick={() => setTab("profile")}>📊 Профиль</TabBtn>
        <TabBtn active={tab === "energy"} onClick={() => setTab("energy")}>⚡ Энерги</TabBtn>
        <TabBtn active={tab === "well"} onClick={() => setTab("well")}>🛢 Худаг</TabBtn>
        <TabBtn active={tab === "compensator"} onClick={() => setTab("compensator")}>🔄 Компенсатор</TabBtn>
        <TabBtn active={tab === "pid"} onClick={() => setTab("pid")}>🛠 P&amp;ID</TabBtn>
        {/* Phase 9.1 — Compliance check cluster. Sits between detail
            views and settings — it's project-wide verification that
            engineer typically runs LAST before exporting Drawing Set. */}
        <span aria-hidden style={tabDivider}>|</span>
        <TabBtn active={tab === "compliance"} onClick={() => setTab("compliance")}>📋 Стандарт</TabBtn>
        <span aria-hidden style={tabDivider}>|</span>
        <TabBtn active={tab === "settings"} onClick={() => setTab("settings")}>Тохиргоо</TabBtn>

        <div style={{ flex: 1 }} />

        {looped && (
          <span
            title="Битүү (loop) сүлжээ илрүүлсэн — Hardy-Cross иттераци ашиглана"
            style={{ fontSize: 11, color: "var(--warning)", padding: "0.25rem 0.5rem", border: "1px solid var(--warning)", borderRadius: 4 }}
          >
            ◯ Loop network
          </span>
        )}

        <select
          value={calcMode}
          onChange={(e) => setCalcMode(e.target.value as CalcMode)}
          disabled={readOnly}
          title="Тооцооны горим"
          style={{
            background: "var(--bg)",
            color: "var(--fg)",
            border: "1px solid var(--border)",
            borderRadius: 6,
            padding: "0.4rem 0.5rem",
            fontSize: 12,
          }}
        >
          <option value="verification">Шалгах (бодит)</option>
          <option value="constructive">DN-сонгох (зураг төсөл)</option>
          <option value="commissioning">Тэнцвэржүүлэх (тохируулга)</option>
        </select>

        <button onClick={compute} style={primaryBtn} disabled={state.nodes.length === 0}>
          ⚙ Тооцоолох
        </button>
        {!readOnly && (
          <button onClick={save} style={btn} disabled={saving}>
            {saving ? "Хадгалж..." : "💾 Хадгалах"}
          </button>
        )}
        <button onClick={() => setShowItpPicker(true)} style={btn} title="СП 41-101 ИТП схем сонгох">⊕ ИТП схем</button>
        <button onClick={exportXlsx} style={btn}>📊 Excel</button>
        <button onClick={exportDxf} style={btn}>📐 DXF</button>
        <button onClick={exportPdf} style={btn} title="A3 / A4 PDF татах (Inter-Cyrillic шрифттэй)">🖨 PDF</button>
        <button onClick={exportDrawingSet} style={btn} title="План + Профиль + Эрчим хүч + Худаг + Компенсатор + P&ID — 6-хуудастай PDF">📚 Drawing Set</button>
        <button onClick={quickPrintPreview} style={btn} title="Browser-ийн хэвлэх dialog — OS Print to PDF боломжтой">👁 Preview</button>
        <button onClick={exportZulu} style={btn} title="Hydro .sqlite — Zulu Thermo desktop-тэй нийцтэй формат">⊕ Hydro .sqlite</button>
        {!readOnly && loadedId && (
          <button onClick={share} style={btn}>🔗 Хуваалцах</button>
        )}
        {saveMsg && <span style={{ fontSize: 12, color: "var(--fg-muted)" }}>{saveMsg}</span>}
      </header>

      {/* Calc mode report banner */}
      {calcReport.length > 0 && (
        <div
          style={{
            background: "var(--accent-bg)",
            borderBottom: "1px solid var(--accent-dim)",
            padding: "0.4rem 0.85rem",
            fontSize: 12,
            color: "var(--accent)",
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          {calcReport.map((m, i) => (
            <span key={i}>{m}</span>
          ))}
          <button
            onClick={() => setCalcReport([])}
            style={{ marginLeft: "auto", border: 0, background: "transparent", color: "var(--fg-muted)", cursor: "pointer", fontSize: 14 }}
          >
            ✕
          </button>
        </div>
      )}

      {showItpPicker && (
        <Suspense fallback={<TabLoading />}>
          <ItpSchemePicker
            onCancel={() => setShowItpPicker(false)}
            onPick={(scheme) => {
              // Apply scheme to selected node (or alert if none)
              if (selection?.kind === "node") {
                const noteLines = [
                  `ИТП схем: ${scheme.name_mn}`,
                  scheme.use_case_mn ? `Хэрэглэх: ${scheme.use_case_mn}` : "",
                  scheme.components ? `Тоног: ${scheme.components.map((c) => c.kind).join(", ")}` : "",
                ].filter(Boolean).join("\n");
                updateNodeAction(selection.id, {
                  equipment: scheme.key,
                  notes: noteLines,
                });
                alert(`✓ "${scheme.name_mn}" сонгогдлоо. Зангилаагын тэмдэглэлд хадгаласан.`);
              } else {
                alert("Эхлээд зангилаа сонгоно уу (ИТП эсвэл ЦТП цэг). Дараа нь схемийг хэрэглэнэ.");
              }
              setShowItpPicker(false);
            }}
          />
        </Suspense>
      )}

      {/* Phase 10.3 — Share dialog (read-only token management) */}
      {showShareDialog && loadedId && (
        <Suspense fallback={<TabLoading />}>
          <ShareDialog
            projectId={loadedId}
            onClose={() => setShowShareDialog(false)}
          />
        </Suspense>
      )}

      {/* Main area */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        <main style={{ flex: 1, overflow: "auto" }}>
          {tab === "scheme" && <SchemeEditor readOnly={readOnly} />}
          <Suspense fallback={<TabLoading />}>
            {tab === "results" && <ResultsPanel />}
            {tab === "failure" && <FailurePanel />}
            {tab === "bom" && <BomPanel />}
            {tab === "piezo" && <PiezometricChart />}
            {tab === "balancing" && <BalancingPanel />}
            {tab === "profile" && <LongitudinalProfile />}
            {tab === "energy" && <EnergySchemes />}
            {tab === "well" && <WellDetail />}
            {tab === "compensator" && <CompensatorDetail />}
            {tab === "pid" && <UddtPid />}
            {tab === "compliance" && <ComplianceView />}
            {tab === "settings" && <SettingsPanel readOnly={readOnly} />}
          </Suspense>
        </main>
        {tab === "scheme" && <InspectorPanel readOnly={readOnly} />}
      </div>
    </div>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "0.4rem 0.9rem",
        fontSize: 13,
        border: "1px solid " + (active ? "var(--accent)" : "transparent"),
        background: active ? "var(--accent-bg)" : "transparent",
        color: active ? "var(--accent)" : "var(--fg-muted)",
        borderRadius: 6,
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

/** Suspense fallback shown while a lazy-loaded panel chunk is downloading. */
function TabLoading() {
  return (
    <div style={{ padding: "2rem", textAlign: "center", color: "var(--fg-muted)", fontSize: 13 }}>
      ⏳ Хэсэг ачаалж байна…
    </div>
  );
}

const btn: CSSProperties = {
  padding: "0.4rem 0.8rem",
  fontSize: 13,
  background: "var(--bg)",
  color: "var(--fg)",
  border: "1px solid var(--border)",
  borderRadius: 6,
  cursor: "pointer",
};

// Phase 8 — light pipe-character divider separating Plan-cluster
// tabs from Detail-view tabs in the top tab bar. Lower opacity so
// it reads as a structural cue rather than another tab button.
const tabDivider: CSSProperties = {
  color: "var(--fg-muted)",
  fontSize: 14,
  opacity: 0.5,
  padding: "0 4px",
  userSelect: "none",
};

const primaryBtn: CSSProperties = {
  ...btn,
  background: "var(--accent)",
  color: "#0b1117",
  border: "1px solid var(--accent)",
  fontWeight: 600,
};
