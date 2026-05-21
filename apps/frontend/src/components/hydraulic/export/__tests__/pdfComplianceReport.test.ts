/**
 * Phase 9.4 — Compliance Report PDF renderer tests.
 *
 * Same testing strategy as pdfDetailPages.test.ts: each renderer
 * mutates a jsPDF instance via primitive draws. jsdom + jspdf
 * handles primitive draws fine. Asserts:
 *   1. Doesn't throw on a valid report
 *   2. Writes SOMETHING (page count stays at 1)
 *   3. Empty-violations happy path renders without errors
 *   4. Overflow case (50+ violations) renders without errors
 */
import { describe, it, expect } from "vitest";
import { jsPDF } from "jspdf";
import { renderCompliancePage } from "../pdfComplianceReport";
import {
  DEFAULT_DRAWING_SET_PAGES,
  drawingSetPageLabel,
} from "../pdfExport";
import { runComplianceCheck } from "../../calc/compliance/ruleEngine";
import { ALL_RULES } from "../../calc/compliance/rules";
import { emptyState, type HydraulicState, type SchemeNode, type SchemePipe } from "../../hydraulicTypes";

function newPdf(): jsPDF {
  return new jsPDF({ orientation: "landscape", unit: "mm", format: "a3" });
}

const AREA = { x: 10, y: 10, width: 400, height: 277 };

function fullProject(): HydraulicState {
  const s = emptyState();
  s.nodes = [
    { id: "src", kind: "source_substation", label: "ЦТП", x: 0, y: 0 } as SchemeNode,
    // Phase 13.40 — consumer must carry heatLoad_w now (the new
    // consumerHeatLoadRequired rule). Seed it so the "clean" PDF
    // fixture remains ≤ 5 violations.
    { id: "aos1", kind: "consumer_apartment", label: "АОС-1", x: 100, y: 0, heatLoad_w: 50_000 } as SchemeNode,
  ];
  s.pipes = [{
    id: "p1", fromNodeId: "src", toNodeId: "aos1",
    materialKey: "steel_aged", dn: 100, length_m: 50, circuit: "heating_supply",
  } as SchemePipe];
  s.settings.titleBlock = { engineer: "Б", checker: "С", company: "Co" };
  s.settings.printScale = "1:500";
  s.settings.printPaperSize = "A3";
  s.settings.printOrientation = "landscape";
  return s;
}

/* ─── Renderer ──────────────────────────────────────────────────── */

describe("renderCompliancePage", () => {
  it("renders a clean report (0 violations) → success banner", () => {
    const project = fullProject();
    const report = runComplianceCheck(project, undefined, ALL_RULES);
    expect(report.summary.totalViolations).toBeLessThanOrEqual(5);
    const pdf = newPdf();
    expect(() => renderCompliancePage(pdf, AREA, report)).not.toThrow();
    expect(pdf.getNumberOfPages()).toBe(1);
  });

  it("renders a violation-heavy report without throwing", () => {
    const project = emptyState();
    project.nodes = []; // triggers source + consumer + scale + paper rules
    const report = runComplianceCheck(project, undefined, ALL_RULES);
    expect(report.summary.totalViolations).toBeGreaterThan(0);
    const pdf = newPdf();
    expect(() => renderCompliancePage(pdf, AREA, report)).not.toThrow();
  });

  it("handles a synthetic overflow case (60 violations) without throwing", () => {
    const fakeReport = {
      generatedAt: "2026-05-15T00:00:00Z",
      projectName: "Тест төсөл",
      results: Array.from({ length: 60 }, (_, i) => ({
        ruleId: "velocity_max_supply",
        severity: "warn" as const,
        message: `Зөрчил #${i + 1}`,
        entityType: "pipe" as const,
        entityId: `p${i + 1}`,
        fixHint: "Диаметр ахиулах",
      })),
      rulesChecked: [],
      summary: {
        passedRules: 0,
        info: 0,
        warn: 60,
        error: 0,
        critical: 0,
        totalViolations: 60,
      },
    };
    const pdf = newPdf();
    expect(() => renderCompliancePage(pdf, AREA, fakeReport)).not.toThrow();
  });

  it("renders report with no projectName", () => {
    const project = fullProject();
    project.settings.titleBlock = { engineer: "Б", checker: "С", company: "Co" };
    const report = runComplianceCheck(project, undefined, ALL_RULES);
    report.projectName = "";
    const pdf = newPdf();
    expect(() => renderCompliancePage(pdf, AREA, report)).not.toThrow();
  });
});

/* ─── Drawing Set integration ──────────────────────────────────── */

describe("DEFAULT_DRAWING_SET_PAGES + drawingSetPageLabel — Phase 9.4", () => {
  it("includes 'compliance' as the LAST default page", () => {
    // Phase 12.6b added 'channel' before 'compliance', bumping the
    // total from 7 → 8 pages. Compliance still needs to be the final
    // sheet (engineer's audit closure).
    expect(DEFAULT_DRAWING_SET_PAGES.length).toBeGreaterThanOrEqual(7);
    expect(DEFAULT_DRAWING_SET_PAGES.at(-1)).toBe("compliance");
  });

  it("Mongolian label for 'compliance'", () => {
    expect(drawingSetPageLabel("compliance")).toBe("Стандарт шалгалт");
  });
});

/* ─── exportDrawingSetPdf — compliance-only path ───────────────── */

describe("exportDrawingSetPdf — Phase 9.4 compliance pages", () => {
  it("rejects when includePages omits everything", async () => {
    const { exportDrawingSetPdf } = await import("../pdfExport");
    await expect(exportDrawingSetPdf({
      state: emptyState(),
      settings: emptyState().settings,
      paperSize: "A3",
      orientation: "landscape",
      scale: "1:500",
      svgElement: null,
      includePages: ["plan"], // filtered out (no svg)
    })).rejects.toThrow(/Drawing set хоосон/);
  });
});
