/**
 * Phase 9.4 — Compliance Report PDF renderer.
 *
 * Renders one drawing-set page (typically Sheet 7/7) showing the
 * compliance check results: summary tiles + per-violation table.
 * Sits alongside the Phase 8.6 detail-page renderers and is wired
 * into `exportDrawingSetPdf` so the engineer's "📚 Drawing Set"
 * button bundles compliance into the same multi-page PDF.
 *
 * The renderer is pure jsPDF primitives (text, rect, line, circle)
 * — no svg2pdf, no DOM. Mongolian glyphs use the embedded
 * Roboto-Cyrillic font configured upstream in pdfExport.ts.
 *
 * Layout (A3 landscape):
 *   - Top: sheet title + project name + generated date
 *   - Summary band: 5 severity tiles + total
 *   - Violations table: severity badge | rule | entity | message
 *     - Sorted: critical → error → warn → info
 *     - Paginates within the drawing area (if > available rows,
 *       overflows to "...еще N зөрчил" footer line)
 *   - Footer: standards refs + signature line
 *
 * Handles the "0 violations" happy path with a centered
 * "✓ Бүх дүрэм тэнцсэн" success banner.
 */
import type { jsPDF } from "jspdf";
import type { ComplianceReport } from "../calc/compliance/ruleEngine";
import { severityLabel } from "../calc/compliance/ruleEngine";
import { ALL_RULES } from "../calc/compliance/rules";
import type { PageArea } from "./pdfDetailPages";

/* ─── Theme ──────────────────────────────────────────────────────── */

const SEVERITY_COLORS: Record<string, { bg: [number, number, number]; fg: [number, number, number] }> = {
  critical: { bg: [254, 226, 226], fg: [127, 29, 29] },
  error: { bg: [255, 238, 238], fg: [163, 45, 45] },
  warn: { bg: [255, 245, 230], fg: [163, 90, 0] },
  info: { bg: [230, 241, 255], fg: [24, 95, 165] },
};

/* ─── Public renderer ───────────────────────────────────────────── */

/**
 * Render the Compliance Report sheet into the current jsPDF page.
 *
 * Caller is responsible for `pdf.addPage()` before calling this and
 * for the title block / page-number overlay after.
 *
 * @param pdf      jsPDF instance — caller already set font + page
 * @param area     Drawing area in mm (from `drawingAreaMm()`)
 * @param report   ComplianceReport produced by runComplianceCheck
 */
export function renderCompliancePage(
  pdf: jsPDF,
  area: PageArea,
  report: ComplianceReport,
): void {
  // ─── Header ────────────────────────────────────────────────
  pdf.setTextColor(20, 20, 20);
  pdf.setFontSize(16);
  pdf.text("📋 Стандартын шалгалтын дүн", area.x + area.width / 2, area.y + 8, { align: "center" });

  pdf.setFontSize(9);
  pdf.setTextColor(100, 100, 100);
  const subtitle = report.projectName
    ? `${report.projectName} · ${new Date(report.generatedAt).toLocaleString("mn-MN")}`
    : new Date(report.generatedAt).toLocaleString("mn-MN");
  pdf.text(subtitle, area.x + area.width / 2, area.y + 14, { align: "center" });

  // ─── Summary tiles ─────────────────────────────────────────
  const tileY = area.y + 22;
  const tileH = 14;
  const tileGap = 4;
  const tiles: Array<{ label: string; value: number; tone: keyof typeof SEVERITY_COLORS | "pass" }> = [
    { label: "Тэнцсэн", value: report.summary.passedRules, tone: "pass" },
    { label: "🔴 Чухал", value: report.summary.critical, tone: "critical" },
    { label: "✗ Алдаа", value: report.summary.error, tone: "error" },
    { label: "⚠ Анхааруулга", value: report.summary.warn, tone: "warn" },
    { label: "ℹ Мэдээлэл", value: report.summary.info, tone: "info" },
  ];
  const tileW = (area.width - (tiles.length - 1) * tileGap) / tiles.length;
  for (let i = 0; i < tiles.length; i += 1) {
    const t = tiles[i]!;
    const tx = area.x + i * (tileW + tileGap);
    if (t.tone === "pass") {
      pdf.setFillColor(220, 245, 220);
      pdf.setDrawColor(60, 140, 60);
    } else {
      const c = SEVERITY_COLORS[t.tone]!;
      pdf.setFillColor(c.bg[0], c.bg[1], c.bg[2]);
      pdf.setDrawColor(c.fg[0], c.fg[1], c.fg[2]);
    }
    pdf.setLineWidth(0.2);
    pdf.rect(tx, tileY, tileW, tileH, "FD");
    pdf.setFontSize(8);
    pdf.setTextColor(80, 80, 80);
    pdf.text(t.label, tx + 2, tileY + 4);
    pdf.setFontSize(12);
    pdf.setTextColor(20, 20, 20);
    pdf.text(String(t.value), tx + 2, tileY + 11);
  }

  // ─── Empty-state happy path ───────────────────────────────
  if (report.summary.totalViolations === 0) {
    const bannerY = tileY + tileH + 12;
    const bannerH = 24;
    pdf.setFillColor(220, 245, 220);
    pdf.setDrawColor(60, 140, 60);
    pdf.setLineWidth(0.4);
    pdf.rect(area.x, bannerY, area.width, bannerH, "FD");
    pdf.setFontSize(18);
    pdf.setTextColor(40, 110, 40);
    pdf.text("✓ Бүх дүрэм тэнцсэн!", area.x + area.width / 2, bannerY + 14, { align: "center" });
    pdf.setFontSize(9);
    pdf.setTextColor(80, 100, 80);
    pdf.text(
      `${report.summary.passedRules} дүрэм шалгасан · 0 зөрчил илрээгүй`,
      area.x + area.width / 2,
      bannerY + 20,
      { align: "center" },
    );
    renderFooter(pdf, area, report);
    return;
  }

  // ─── Violations table ─────────────────────────────────────
  const tableY = tileY + tileH + 8;
  pdf.setFontSize(10);
  pdf.setTextColor(20, 20, 20);
  pdf.text(`Зөрчилүүд (${report.summary.totalViolations}):`, area.x, tableY);

  // Column widths (mm): severity 28 / rule 55 / entity 30 / message rest / fixHint 60
  const colSeverity = 28;
  const colRule = 55;
  const colEntity = 30;
  const colHint = 60;
  const colMessage = area.width - colSeverity - colRule - colEntity - colHint;

  const headerY = tableY + 4;
  drawTableHeader(pdf, area.x, headerY, [
    { w: colSeverity, label: "Зэрэг" },
    { w: colRule, label: "Дүрэм" },
    { w: colEntity, label: "Объект" },
    { w: colMessage, label: "Тайлбар" },
    { w: colHint, label: "Засах" },
  ]);

  let rowY = headerY + 6;
  const maxY = area.y + area.height - 24; // reserve for footer
  let rendered = 0;
  for (const v of report.results) {
    if (rowY + 6 > maxY) break;
    const c = SEVERITY_COLORS[v.severity] ?? SEVERITY_COLORS.info!;
    pdf.setFillColor(c.bg[0], c.bg[1], c.bg[2]);
    pdf.setDrawColor(220, 220, 220);
    pdf.setLineWidth(0.1);
    // Severity badge cell
    pdf.rect(area.x, rowY - 4, colSeverity, 6, "F");
    pdf.setTextColor(c.fg[0], c.fg[1], c.fg[2]);
    pdf.setFontSize(8);
    pdf.text(severityLabel(v.severity), area.x + 1, rowY);

    // Rule cell
    pdf.setTextColor(30, 30, 30);
    pdf.setFontSize(8);
    const rule = ALL_RULES.find((r) => r.id === v.ruleId);
    const ruleText = rule?.name ?? v.ruleId;
    const ruleLines = pdf.splitTextToSize(ruleText, colRule - 2);
    pdf.text(ruleLines[0]!, area.x + colSeverity + 1, rowY);
    if (rule?.standardRef) {
      pdf.setFontSize(6);
      pdf.setTextColor(100, 100, 100);
      pdf.text(rule.standardRef, area.x + colSeverity + 1, rowY + 3);
    }

    // Entity cell
    pdf.setFontSize(7);
    pdf.setTextColor(50, 50, 50);
    const entityText = v.entityType && v.entityId ? `${v.entityType}: ${v.entityId}` : "—";
    pdf.text(entityText, area.x + colSeverity + colRule + 1, rowY);

    // Message cell
    pdf.setFontSize(8);
    pdf.setTextColor(20, 20, 20);
    const msgX = area.x + colSeverity + colRule + colEntity + 1;
    const msgLines = pdf.splitTextToSize(v.message, colMessage - 2);
    pdf.text(msgLines.slice(0, 2).join("\n"), msgX, rowY);

    // Fix hint
    if (v.fixHint) {
      pdf.setFontSize(7);
      pdf.setTextColor(80, 80, 80);
      const hintX = msgX + colMessage;
      const hintLines = pdf.splitTextToSize(v.fixHint, colHint - 2);
      pdf.text(hintLines.slice(0, 2).join("\n"), hintX, rowY);
    }

    // Bottom border
    pdf.setDrawColor(220, 220, 220);
    pdf.setLineWidth(0.1);
    pdf.line(area.x, rowY + 2.5, area.x + area.width, rowY + 2.5);

    rowY += 7;
    rendered += 1;
  }

  // ─── Overflow notice ──────────────────────────────────────
  if (rendered < report.results.length) {
    const remaining = report.results.length - rendered;
    pdf.setFontSize(8);
    pdf.setTextColor(100, 100, 100);
    pdf.text(
      `… бас ${remaining} зөрчил харагдсангүй. Бүх жагсаалт Стандарт таб дээр.`,
      area.x + area.width / 2,
      rowY + 3,
      { align: "center" },
    );
  }

  renderFooter(pdf, area, report);
}

/* ─── Helpers ────────────────────────────────────────────────────── */

function drawTableHeader(
  pdf: jsPDF,
  x: number,
  y: number,
  cols: ReadonlyArray<{ w: number; label: string }>,
): void {
  pdf.setFillColor(240, 240, 240);
  pdf.setDrawColor(120, 120, 120);
  pdf.setLineWidth(0.2);
  let cx = x;
  let totalW = 0;
  for (const col of cols) totalW += col.w;
  pdf.rect(x, y - 4, totalW, 6, "FD");
  pdf.setFontSize(8);
  pdf.setTextColor(40, 40, 40);
  for (const col of cols) {
    pdf.text(col.label, cx + 1, y);
    cx += col.w;
  }
}

function renderFooter(pdf: jsPDF, area: PageArea, report: ComplianceReport): void {
  const footY = area.y + area.height - 12;
  pdf.setDrawColor(180, 180, 180);
  pdf.setLineWidth(0.2);
  pdf.line(area.x, footY, area.x + area.width, footY);
  pdf.setFontSize(7);
  pdf.setTextColor(100, 100, 100);
  pdf.text(
    `Шалгасан: ${report.summary.passedRules + report.summary.totalViolations} дүрэм · Стандартууд: БНбД 41-02-13 · БНбД 41-01-2019 · СП 124.13330.2012 · ГОСТ 8732 / 30732`,
    area.x,
    footY + 4,
  );
  pdf.setFontSize(7);
  pdf.setTextColor(40, 40, 40);
  pdf.text("Зурсан / Шалгасан / Бат. зөвш.: ", area.x, footY + 9);
  pdf.line(area.x + 35, footY + 9, area.x + area.width / 2, footY + 9);
}
