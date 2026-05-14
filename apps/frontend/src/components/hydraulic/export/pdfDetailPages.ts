/**
 * Phase 8.6 — PDF detail page renderers.
 *
 * One pure builder per detail view (profile / energy / well /
 * compensator / P&ID). Each draws a single drawing-area worth of
 * content using jsPDF primitives — vector text, lines, rectangles,
 * circles, triangles. No svg2pdf round-trip needed because the
 * data already lives in pure-helper shape from `scheme/<name>.ts`.
 *
 * Renderers follow the same contract:
 *   - INPUT:  jsPDF instance + drawing area (mm) + state + settings +
 *             optional CalculationResults
 *   - OUTPUT: void. The pdf instance is mutated; caller is
 *             responsible for adding the next page + title block.
 *
 * When the underlying helper returns `{ error }` (e.g. no source on
 * the network for the profile sheet), the renderer draws a friendly
 * banner inside the drawing area so the engineer can see "yes the
 * drawing set was generated, but page N is empty because <reason>"
 * instead of getting a blank sheet.
 *
 * Standard references on a per-page basis live in each renderer's
 * doc-comment. The general convention here is ГОСТ 21.605 (drawing
 * sheet headers) + ГОСТ 21.501 (sheet ordering).
 */
import type { jsPDF } from "jspdf";
import type {
  HydraulicState,
  CalculationResults,
} from "../hydraulicTypes";
import {
  buildLongitudinalProfile,
  formatChainage,
  pickChainageTickStep,
  pickElevationTickStep,
  type ProfileTrace,
} from "../scheme/longitudinalProfile";
import {
  buildEnergyScheme,
  circuitLabel,
  consumerKindLabel,
  type EnergyScheme,
} from "../scheme/energyScheme";
import {
  buildWellDetail,
  sideLabel,
  type WellDetail,
  type PenetrationSide,
} from "../scheme/wellDetail";
import {
  buildCompensatorDetail,
  variantLabel,
  type CompensatorDetail,
} from "../scheme/compensatorDetail";
import {
  buildPidLayout,
  roleLabel,
  type PidLayout,
  type PidElement,
} from "../scheme/pid";

/** Drawing area on the page in mm. */
export interface PageArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

/* ─── Shared helpers ─────────────────────────────────────────────── */

/**
 * Draw a "no data" banner spanning the drawing area. Used when a
 * detail helper returns `{ error: ... }` — engineer still sees the
 * page exists in the bundle, with the reason in plain Mongolian.
 */
function renderErrorBanner(pdf: jsPDF, area: PageArea, title: string, msg: string): void {
  pdf.setDrawColor(180, 80, 80);
  pdf.setFillColor(255, 245, 245);
  pdf.setLineWidth(0.3);
  pdf.rect(area.x, area.y, area.width, area.height, "FD");
  pdf.setTextColor(120, 30, 30);
  pdf.setFontSize(14);
  pdf.text(title, area.x + area.width / 2, area.y + area.height / 2 - 6, {
    align: "center",
  });
  pdf.setFontSize(10);
  pdf.setTextColor(80, 30, 30);
  const wrapped = pdf.splitTextToSize(msg, area.width - 20);
  pdf.text(wrapped, area.x + area.width / 2, area.y + area.height / 2 + 4, {
    align: "center",
  });
  pdf.setTextColor(0, 0, 0);
  pdf.setFontSize(10);
}

/** Draw a centred sheet title at the top of the drawing area. */
function renderSheetTitle(pdf: jsPDF, area: PageArea, title: string, subtitle?: string): void {
  pdf.setTextColor(20, 20, 20);
  pdf.setFontSize(14);
  pdf.text(title, area.x + area.width / 2, area.y + 8, { align: "center" });
  if (subtitle) {
    pdf.setFontSize(9);
    pdf.setTextColor(100, 100, 100);
    pdf.text(subtitle, area.x + area.width / 2, area.y + 13, { align: "center" });
  }
  pdf.setTextColor(0, 0, 0);
  pdf.setFontSize(10);
}

/* ─── Page 2: Longitudinal profile ──────────────────────────────── */

/**
 * Render the longitudinal profile sheet — chainage axis (X) +
 * elevation axis (Y) + ground line + pipe centerline + node markers.
 *
 * Standard ref: СП 124.13330.2012 §7.4 (magistral profile) +
 * ГОСТ 21.605 (chainage labelling).
 */
export function renderProfilePage(
  pdf: jsPDF,
  area: PageArea,
  state: HydraulicState,
): void {
  renderSheetTitle(pdf, area, "Уртын профиль", "Магистрал шугамын чиглэлээр (Эх үүсвэр → Хамгийн хол хэрэглэгч)");

  const trace = buildLongitudinalProfile(state.nodes, state.pipes);
  if ("error" in trace) {
    const banner = { x: area.x + 10, y: area.y + 30, width: area.width - 20, height: 40 };
    renderErrorBanner(pdf, banner, "Профиль гаргах боломжгүй", trace.error);
    return;
  }

  drawProfileTrace(pdf, area, trace);
}

function drawProfileTrace(pdf: jsPDF, area: PageArea, trace: ProfileTrace): void {
  // Reserve top 16 mm for the title + bottom 20 mm for the chainage
  // labels + 20 mm left margin for the elevation labels.
  const plot: PageArea = {
    x: area.x + 25,
    y: area.y + 20,
    width: area.width - 35,
    height: area.height - 45,
  };

  // X domain: 0 → totalLength_m
  const xMin = 0;
  const xMax = Math.max(1, trace.totalLength_m);
  // Y domain: pad the elev range so the trace doesn't hug the edges.
  let yMin = trace.minElevation_m;
  let yMax = trace.maxElevation_m;
  if (yMax - yMin < 1) {
    yMin -= 0.5;
    yMax += 0.5;
  }
  const yRange = yMax - yMin;
  const yPad = Math.max(yRange * 0.15, 0.5);
  yMin -= yPad;
  yMax += yPad;

  const xToMm = (x: number) => plot.x + ((x - xMin) / (xMax - xMin)) * plot.width;
  const yToMm = (y: number) => plot.y + plot.height - ((y - yMin) / (yMax - yMin)) * plot.height;

  // Plot frame
  pdf.setDrawColor(60, 60, 60);
  pdf.setLineWidth(0.3);
  pdf.rect(plot.x, plot.y, plot.width, plot.height);

  // Grid + tick labels
  pdf.setFontSize(7);
  pdf.setTextColor(70, 70, 70);
  const xStep = pickChainageTickStep(trace.totalLength_m);
  for (let xv = 0; xv <= xMax + 0.001; xv += xStep) {
    const px = xToMm(xv);
    pdf.setDrawColor(220, 220, 220);
    pdf.setLineWidth(0.1);
    pdf.line(px, plot.y, px, plot.y + plot.height);
    pdf.setDrawColor(60, 60, 60);
    pdf.line(px, plot.y + plot.height, px, plot.y + plot.height + 1.5);
    pdf.text(formatChainage(xv), px, plot.y + plot.height + 4, { align: "center" });
  }
  const yStep = pickElevationTickStep(yMax - yMin);
  const yStart = Math.ceil(yMin / yStep) * yStep;
  for (let yv = yStart; yv <= yMax; yv += yStep) {
    const py = yToMm(yv);
    pdf.setDrawColor(220, 220, 220);
    pdf.setLineWidth(0.1);
    pdf.line(plot.x, py, plot.x + plot.width, py);
    pdf.setDrawColor(60, 60, 60);
    pdf.line(plot.x - 1.5, py, plot.x, py);
    pdf.text(`${yv.toFixed(1)}`, plot.x - 2, py + 1.2, { align: "right" });
  }
  // Axis labels
  pdf.setFontSize(8);
  pdf.setTextColor(40, 40, 40);
  pdf.text("Гадаргын өндөр (м)", plot.x - 17, plot.y + plot.height / 2, {
    align: "center",
    angle: 90,
  });
  pdf.text("Чиглэл (Зүүн → Баруун, км+м)", plot.x + plot.width / 2, plot.y + plot.height + 9, {
    align: "center",
  });

  // Ground line — connect points via straight segments.
  pdf.setDrawColor(120, 80, 30);
  pdf.setLineWidth(0.7);
  let prev: { px: number; py: number } | null = null;
  for (const p of trace.points) {
    const px = xToMm(p.chainage_m);
    const py = yToMm(p.elevation_m);
    if (prev) pdf.line(prev.px, prev.py, px, py);
    prev = { px, py };
  }
  // Pipe centerline track — only when burial depth is on the entry pipe.
  pdf.setDrawColor(180, 50, 50);
  pdf.setLineWidth(0.4);
  pdf.setLineDashPattern([1.2, 0.8], 0);
  prev = null;
  for (const p of trace.points) {
    if (p.entryBurialDepth_m === undefined) {
      prev = null;
      continue;
    }
    const px = xToMm(p.chainage_m);
    const py = yToMm(p.elevation_m - p.entryBurialDepth_m);
    if (prev) pdf.line(prev.px, prev.py, px, py);
    prev = { px, py };
  }
  pdf.setLineDashPattern([], 0);

  // Node markers + labels
  pdf.setFontSize(7);
  for (const p of trace.points) {
    const px = xToMm(p.chainage_m);
    const py = yToMm(p.elevation_m);
    pdf.setFillColor(30, 100, 180);
    pdf.setDrawColor(20, 70, 130);
    pdf.setLineWidth(0.2);
    pdf.circle(px, py, 1.2, "FD");
    pdf.setTextColor(30, 30, 30);
    pdf.text(p.label, px, py - 2.5, { align: "center" });
    if (p.entryDn_mm) {
      pdf.setTextColor(120, 30, 30);
      pdf.text(`DN${p.entryDn_mm}`, px, py + 3.5, { align: "center" });
    }
  }

  // Summary strip
  pdf.setFontSize(8);
  pdf.setTextColor(20, 20, 20);
  pdf.text(
    `Нийт урт: ${trace.totalLength_m.toFixed(1)} м · ` +
    `H мин/мах: ${trace.minElevation_m.toFixed(2)} / ${trace.maxElevation_m.toFixed(2)} м` +
    (!trace.anyElevation ? " · ⚠ Өндрийн өгөгдөл байхгүй (0-ээр буусан)" : ""),
    plot.x,
    area.y + area.height - 4,
  );
}

/* ─── Page 3: Energy schemes ────────────────────────────────────── */

/**
 * Render the energy-balance sheet — Sankey-lite bar + per-circuit
 * table + per-consumer table.
 *
 * Standard ref: БНбД 41-01-2019 §5 (heat-load summation) +
 * СП 124.13330.2012 §6 (loss accounting).
 */
export function renderEnergyPage(
  pdf: jsPDF,
  area: PageArea,
  state: HydraulicState,
  results: CalculationResults | undefined,
): void {
  renderSheetTitle(
    pdf,
    area,
    "Дулааны тэнцэл",
    "Эх үүсвэрийн гарц = Хэрэглэгчдийн ачаалал + Шугамын алдагдал",
  );

  const view = buildEnergyScheme(state.nodes, state.pipes, results);
  if ("error" in view) {
    const banner = { x: area.x + 10, y: area.y + 30, width: area.width - 20, height: 40 };
    renderErrorBanner(pdf, banner, "Тэнцэл гаргах боломжгүй", view.error);
    return;
  }
  drawEnergyView(pdf, area, view);
}

function drawEnergyView(pdf: jsPDF, area: PageArea, view: EnergyScheme): void {
  const b = view.balance;
  // Top stat tiles (6 in a row)
  const tileY = area.y + 20;
  const tileH = 16;
  const tileW = (area.width - 10) / 6;
  const tiles: Array<{ label: string; value: string }> = [
    { label: "Эх үүсвэр", value: `${b.sourceOutput_kw.toFixed(1)} кВт` },
    { label: "Хэрэглэгч", value: `${b.totalConsumerLoad_kw.toFixed(1)} кВт` },
    { label: "Алдагдал", value: `${b.totalDistributionLoss_kw.toFixed(1)} кВт` },
    { label: "Алдагдал %", value: `${(b.lossFraction * 100).toFixed(1)}%` },
    { label: "Эх t°", value: typeof b.sourceSupplyTemp_C === "number" ? `${b.sourceSupplyTemp_C.toFixed(0)} °C` : "—" },
    { label: "Хэрэглэгч мин t°", value: typeof b.minConsumerSupplyTemp_C === "number" ? `${b.minConsumerSupplyTemp_C.toFixed(0)} °C` : "—" },
  ];
  pdf.setDrawColor(180, 180, 180);
  pdf.setFillColor(245, 245, 250);
  pdf.setLineWidth(0.2);
  for (let i = 0; i < tiles.length; i += 1) {
    const x0 = area.x + 5 + i * tileW;
    pdf.rect(x0, tileY, tileW - 2, tileH, "FD");
    pdf.setTextColor(90, 90, 90);
    pdf.setFontSize(7);
    pdf.text(tiles[i]!.label, x0 + 2, tileY + 4);
    pdf.setTextColor(20, 20, 20);
    pdf.setFontSize(10);
    pdf.text(tiles[i]!.value, x0 + 2, tileY + 12);
  }

  // Sankey-lite balance bar showing consumer vs loss split
  const barY = tileY + tileH + 8;
  const barH = 8;
  const barX = area.x + 5;
  const barW = area.width - 10;
  const consumerW = b.sourceOutput_kw > 0 ? (b.totalConsumerLoad_kw / b.sourceOutput_kw) * barW : barW;
  const lossW = b.sourceOutput_kw > 0 ? (b.totalDistributionLoss_kw / b.sourceOutput_kw) * barW : 0;
  pdf.setFillColor(40, 140, 70);
  pdf.setDrawColor(40, 140, 70);
  pdf.rect(barX, barY, consumerW, barH, "F");
  pdf.setFillColor(200, 110, 30);
  pdf.setDrawColor(200, 110, 30);
  pdf.rect(barX + consumerW, barY, lossW, barH, "F");
  pdf.setDrawColor(80, 80, 80);
  pdf.setLineWidth(0.3);
  pdf.rect(barX, barY, barW, barH);
  pdf.setFontSize(7);
  pdf.setTextColor(255, 255, 255);
  if (consumerW > 30) {
    pdf.text(`Хэрэглэгч ${(b.totalConsumerLoad_kw / b.sourceOutput_kw * 100 || 0).toFixed(0)}%`, barX + 3, barY + 5.5);
  }
  if (lossW > 30) {
    pdf.text(`Алдагдал ${(b.lossFraction * 100).toFixed(0)}%`, barX + consumerW + 3, barY + 5.5);
  }
  pdf.setTextColor(0, 0, 0);

  // БНбД advisory
  let cursorY = barY + barH + 8;
  if (!b.meetsMinSupplyTemp) {
    pdf.setFillColor(255, 240, 230);
    pdf.setDrawColor(200, 110, 30);
    pdf.setLineWidth(0.2);
    pdf.rect(area.x + 5, cursorY, area.width - 10, 8, "FD");
    pdf.setTextColor(150, 60, 0);
    pdf.setFontSize(8);
    pdf.text(
      `⚠ БНбД 41-01-2019 §5.4 — Хэрэглэгчийн нийлүүлэх t° ${(b.minConsumerSupplyTemp_C ?? 0).toFixed(0)} °C < 80 °C`,
      area.x + 8,
      cursorY + 5.5,
    );
    pdf.setTextColor(0, 0, 0);
    cursorY += 10;
  }

  // Per-circuit losses table
  cursorY += 4;
  pdf.setFontSize(10);
  pdf.setTextColor(20, 20, 20);
  pdf.text("Хэлхээ тус бүрийн шугамын алдагдал", area.x + 5, cursorY);
  cursorY += 4;
  const tableW = area.width - 10;
  const colWidths = [tableW * 0.40, tableW * 0.20, tableW * 0.20, tableW * 0.20];
  drawTableHeader(pdf, area.x + 5, cursorY, colWidths, ["Хэлхээ", "Алдагдал (кВт)", "Урт (м)", "Дундаж (Вт/м)"]);
  cursorY += 5;
  for (const row of view.circuitLosses) {
    if (cursorY > area.y + area.height - 14) break;
    drawTableRow(pdf, area.x + 5, cursorY, colWidths, [
      circuitLabel(row.circuit),
      (row.loss_w / 1000).toFixed(2),
      row.totalLength_m.toFixed(1),
      row.avgLossPerMeter_W.toFixed(2),
    ]);
    cursorY += 4.5;
  }

  // Per-consumer loads
  if (cursorY < area.y + area.height - 30) {
    cursorY += 4;
    pdf.setFontSize(10);
    pdf.text("Хэрэглэгчдийн ачаалал", area.x + 5, cursorY);
    cursorY += 4;
    const ccol = [tableW * 0.35, tableW * 0.18, tableW * 0.18, tableW * 0.14, tableW * 0.15];
    drawTableHeader(pdf, area.x + 5, cursorY, ccol, ["Хэрэглэгч", "Төрөл", "Ачаалал (кВт)", "Хувь", "T° нийл."]);
    cursorY += 5;
    for (const row of view.consumers) {
      if (cursorY > area.y + area.height - 8) break;
      drawTableRow(pdf, area.x + 5, cursorY, ccol, [
        row.label,
        consumerKindLabel(row.kind),
        row.load_kw.toFixed(2),
        `${(row.fractionOfTotal * 100).toFixed(1)}%`,
        typeof row.supplyTemp_C === "number" ? `${row.supplyTemp_C.toFixed(0)} °C` : "—",
      ]);
      cursorY += 4.5;
    }
  }
}

function drawTableHeader(
  pdf: jsPDF,
  x: number,
  y: number,
  colWidths: number[],
  labels: string[],
): void {
  pdf.setFillColor(230, 230, 230);
  pdf.setDrawColor(120, 120, 120);
  pdf.setLineWidth(0.2);
  const totalW = colWidths.reduce((s, w) => s + w, 0);
  pdf.rect(x, y, totalW, 4.5, "FD");
  pdf.setFontSize(8);
  pdf.setTextColor(30, 30, 30);
  let cx = x;
  for (let i = 0; i < labels.length; i += 1) {
    pdf.text(labels[i]!, cx + 1, y + 3.2);
    cx += colWidths[i]!;
  }
}

function drawTableRow(
  pdf: jsPDF,
  x: number,
  y: number,
  colWidths: number[],
  values: string[],
): void {
  pdf.setFontSize(8);
  pdf.setTextColor(20, 20, 20);
  let cx = x;
  for (let i = 0; i < values.length; i += 1) {
    pdf.text(values[i]!, cx + 1, y + 3.2);
    cx += colWidths[i]!;
  }
  pdf.setDrawColor(220, 220, 220);
  pdf.setLineWidth(0.1);
  const totalW = colWidths.reduce((s, w) => s + w, 0);
  pdf.line(x, y + 4, x + totalW, y + 4);
}

/* ─── Page 4: Well chamber detail ───────────────────────────────── */

/**
 * Render the well/chamber cross-section sheet — rectangle with
 * dimension callouts + pipe stubs on each of the 4 sides + manhole
 * ellipse on top.
 *
 * Standard ref: ГОСТ 21.605 (chamber detail sheet) + БНбД 41-01-2019
 * §6.2 (chamber siting).
 */
export function renderWellPage(
  pdf: jsPDF,
  area: PageArea,
  state: HydraulicState,
  selection: { kind: string; id: string } | null = null,
): void {
  renderSheetTitle(pdf, area, "Худаг / Камерын зүсэлт", "Үндсэн хэмжээ + хоолойн оролт-гарц + луковка");

  const view = buildWellDetail(state.nodes, state.pipes, selection);
  if ("error" in view) {
    const banner = { x: area.x + 10, y: area.y + 30, width: area.width - 20, height: 40 };
    renderErrorBanner(pdf, banner, "Худагны зүсэлт гаргах боломжгүй", view.error);
    return;
  }
  drawWellCrossSection(pdf, area, view);
}

function drawWellCrossSection(pdf: jsPDF, area: PageArea, view: WellDetail): void {
  // Center the chamber rectangle in the upper 60% of the area; leave
  // bottom 40% for the per-penetration table.
  const plotH = area.height * 0.55;
  const plotW = area.width - 40;
  const plotX = area.x + 20;
  const plotY = area.y + 20;

  // Scale: longest dimension fills 70% of plot width/height.
  const scale = Math.min(
    (plotW * 0.7) / view.length_m,
    (plotH * 0.55) / view.depth_m,
  );
  const rectW = view.length_m * scale;
  const rectH = view.depth_m * scale;
  const cx = plotX + plotW / 2;
  const groundY = plotY + 12; // ground line position
  const rectX = cx - rectW / 2;
  const rectY = groundY;

  // Ground line
  pdf.setDrawColor(120, 80, 30);
  pdf.setLineWidth(0.6);
  pdf.line(plotX + 5, groundY, plotX + plotW - 5, groundY);
  // Hatching above ground
  pdf.setDrawColor(160, 110, 50);
  pdf.setLineWidth(0.15);
  for (let hx = plotX + 5; hx <= plotX + plotW - 5; hx += 4) {
    pdf.line(hx, groundY, hx - 2.5, groundY - 2.5);
  }

  // Chamber box (filled)
  pdf.setFillColor(240, 245, 255);
  pdf.setDrawColor(30, 60, 130);
  pdf.setLineWidth(0.5);
  pdf.rect(rectX, rectY, rectW, rectH, "FD");

  // Cover (manhole) — ellipse on top
  const coverW_m = view.coverDiameter_mm / 1000;
  const coverWmm = coverW_m * scale;
  const coverH = Math.max(3, coverWmm * 0.25);
  pdf.setFillColor(200, 200, 210);
  pdf.setDrawColor(60, 60, 80);
  pdf.ellipse(cx, rectY, coverWmm / 2, coverH / 2, "FD");

  // Pipe stubs — 4 sides
  pdf.setLineWidth(0.6);
  pdf.setDrawColor(180, 50, 50);
  const stubByside: Record<PenetrationSide, { count: number; max: number; positions: { dn: number; y?: number; x?: number }[] }> = {
    top: { count: 0, max: 0, positions: [] },
    bottom: { count: 0, max: 0, positions: [] },
    left: { count: 0, max: 0, positions: [] },
    right: { count: 0, max: 0, positions: [] },
  };
  for (const p of view.penetrations) {
    stubByside[p.side].count += 1;
  }
  // Distribute stubs vertically/horizontally along each side.
  const stubsLeft = view.penetrations.filter((p) => p.side === "left");
  const stubsRight = view.penetrations.filter((p) => p.side === "right");
  const stubsTop = view.penetrations.filter((p) => p.side === "top");
  const stubsBottom = view.penetrations.filter((p) => p.side === "bottom");

  // Helper: stub thickness from DN (mm). 50mm DN → 0.6mm; 500mm → 2.4mm.
  const stubThickness = (dn: number) => Math.max(0.4, Math.min(2.5, dn / 200));

  // LEFT side (drawn coming from the left into the chamber)
  for (let i = 0; i < stubsLeft.length; i += 1) {
    const p = stubsLeft[i]!;
    const y = rectY + (rectH * (i + 1)) / (stubsLeft.length + 1);
    pdf.setLineWidth(stubThickness(p.dn_mm));
    pdf.line(rectX - 12, y, rectX, y);
    pdf.setFontSize(7);
    pdf.setTextColor(150, 30, 30);
    pdf.text(`DN${p.dn_mm}`, rectX - 13, y - 1, { align: "right" });
    pdf.text(p.neighbourLabel, rectX - 13, y + 3, { align: "right" });
  }
  // RIGHT side
  for (let i = 0; i < stubsRight.length; i += 1) {
    const p = stubsRight[i]!;
    const y = rectY + (rectH * (i + 1)) / (stubsRight.length + 1);
    pdf.setLineWidth(stubThickness(p.dn_mm));
    pdf.line(rectX + rectW, y, rectX + rectW + 12, y);
    pdf.setFontSize(7);
    pdf.setTextColor(150, 30, 30);
    pdf.text(`DN${p.dn_mm}`, rectX + rectW + 13, y - 1);
    pdf.text(p.neighbourLabel, rectX + rectW + 13, y + 3);
  }
  // TOP side — stubs above the chamber (drop downwards)
  for (let i = 0; i < stubsTop.length; i += 1) {
    const p = stubsTop[i]!;
    const x = rectX + (rectW * (i + 1)) / (stubsTop.length + 1);
    pdf.setLineWidth(stubThickness(p.dn_mm));
    pdf.line(x, rectY - 6, x, rectY);
    pdf.setFontSize(7);
    pdf.setTextColor(150, 30, 30);
    pdf.text(`DN${p.dn_mm} ${p.neighbourLabel}`, x, rectY - 7, { align: "center" });
  }
  // BOTTOM side
  for (let i = 0; i < stubsBottom.length; i += 1) {
    const p = stubsBottom[i]!;
    const x = rectX + (rectW * (i + 1)) / (stubsBottom.length + 1);
    pdf.setLineWidth(stubThickness(p.dn_mm));
    pdf.line(x, rectY + rectH, x, rectY + rectH + 8);
    pdf.setFontSize(7);
    pdf.setTextColor(150, 30, 30);
    pdf.text(`DN${p.dn_mm} ${p.neighbourLabel}`, x, rectY + rectH + 11, { align: "center" });
  }

  // Dimension callouts
  pdf.setDrawColor(20, 20, 20);
  pdf.setLineWidth(0.3);
  // Width dimension (below the chamber)
  const dimY = rectY + rectH + (stubsBottom.length > 0 ? 18 : 6);
  pdf.line(rectX, dimY - 1, rectX, dimY + 1);
  pdf.line(rectX + rectW, dimY - 1, rectX + rectW, dimY + 1);
  pdf.line(rectX, dimY, rectX + rectW, dimY);
  pdf.setFontSize(8);
  pdf.setTextColor(20, 20, 20);
  pdf.text(`L = ${view.length_m.toFixed(2)} м`, cx, dimY + 4, { align: "center" });
  // Depth dimension (right of chamber)
  const dimX = rectX + rectW + (stubsRight.length > 0 ? 28 : 6);
  pdf.line(dimX - 1, rectY, dimX + 1, rectY);
  pdf.line(dimX - 1, rectY + rectH, dimX + 1, rectY + rectH);
  pdf.line(dimX, rectY, dimX, rectY + rectH);
  pdf.text(`H = ${view.depth_m.toFixed(2)} м`, dimX + 2, rectY + rectH / 2, { align: "left" });

  // Spec table at the bottom
  const tableY = plotY + plotH + 4;
  pdf.setFontSize(9);
  pdf.setTextColor(20, 20, 20);
  pdf.text(`Камер: ${view.label}  (${view.kind})`, area.x + 5, tableY);
  pdf.setFontSize(8);
  pdf.setTextColor(60, 60, 60);
  pdf.text(
    `Урт ${view.length_m.toFixed(2)} м · Өргөн ${view.width_m.toFixed(2)} м · ` +
    `Гүн ${view.depth_m.toFixed(2)} м · Тагны Ø ${view.coverDiameter_mm} мм` +
    (view.hasExplicitDimensions ? "" : "  (default утга)"),
    area.x + 5,
    tableY + 4,
  );

  // Penetration table
  const peneY = tableY + 12;
  const tableW = area.width - 10;
  const cols = [tableW * 0.10, tableW * 0.18, tableW * 0.15, tableW * 0.25, tableW * 0.32];
  drawTableHeader(pdf, area.x + 5, peneY, cols, ["Тал", "DN (мм)", "Хэлхээ", "Хөрш зангилаа", "Тайлбар"]);
  let rowY = peneY + 5;
  for (const p of view.penetrations) {
    if (rowY > area.y + area.height - 6) break;
    drawTableRow(pdf, area.x + 5, rowY, cols, [
      sideLabel(p.side),
      String(p.dn_mm),
      p.circuit ? circuitLabel(p.circuit) : "—",
      p.neighbourLabel,
      "",
    ]);
    rowY += 4.5;
  }
}

/* ─── Page 5: Compensator detail ────────────────────────────────── */

/**
 * Render the compensator detail sheet — variant-specific shape +
 * anchor blocks (НТ-1, НТ-2) + thermal-expansion math table.
 *
 * Standard ref: ГОСТ 21.605 + СП 124.13330.2012 §11.3 (compensator
 * thermal-expansion sizing).
 */
export function renderCompensatorPage(
  pdf: jsPDF,
  area: PageArea,
  state: HydraulicState,
  selection: { kind: string; id: string } | null = null,
): void {
  renderSheetTitle(pdf, area, "Компенсатор зүсэлт", "Дулааны уртасгалт мөн анкерийн байрлал");

  const view = buildCompensatorDetail(state.nodes, selection);
  if ("error" in view) {
    const banner = { x: area.x + 10, y: area.y + 30, width: area.width - 20, height: 40 };
    renderErrorBanner(pdf, banner, "Компенсатор зүсэлт гаргах боломжгүй", view.error);
    return;
  }
  drawCompensator(pdf, area, view);
}

function drawCompensator(pdf: jsPDF, area: PageArea, view: CompensatorDetail): void {
  const plotW = area.width - 20;
  const plotX = area.x + 10;
  const plotY = area.y + 22;
  const plotH = area.height * 0.45;

  const cx = plotX + plotW / 2;
  const cy = plotY + plotH / 2;
  // Scale: largest of span × armHeight × 2*bendRadius/1000 should fit
  // 70% of width / height.
  const maxX_m = Math.max(view.span_m, view.armHeight_m * 2);
  const scale = Math.min((plotW * 0.7) / maxX_m, (plotH * 0.7) / Math.max(view.armHeight_m, view.span_m * 0.5));

  // Anchor blocks (НТ-1 / НТ-2) — left/right
  const anchorYBase = cy + (view.armHeight_m * scale) / 2;
  const leftX = cx - (view.span_m * scale) / 2;
  const rightX = cx + (view.span_m * scale) / 2;
  pdf.setFillColor(60, 60, 60);
  pdf.setDrawColor(40, 40, 40);
  pdf.rect(leftX - 4, anchorYBase, 4, 6, "FD");
  pdf.rect(rightX, anchorYBase, 4, 6, "FD");
  pdf.setFontSize(7);
  pdf.setTextColor(20, 20, 20);
  pdf.text("НТ-1", leftX - 2, anchorYBase + 11, { align: "center" });
  pdf.text("НТ-2", rightX + 2, anchorYBase + 11, { align: "center" });

  // Pipe drawing depends on variant
  pdf.setDrawColor(180, 50, 50);
  pdf.setLineWidth(1.4);
  if (view.variant === "u") {
    // U-bend: horizontal arms + vertical sides + top arc.
    const armY = anchorYBase;
    const sideX1 = cx - (view.span_m * scale) / 4;
    const sideX2 = cx + (view.span_m * scale) / 4;
    const topY = armY - view.armHeight_m * scale;
    pdf.line(leftX, armY, sideX1, armY); // left arm
    pdf.line(sideX1, armY, sideX1, topY + view.bendRadius_mm * scale / 1000); // left side
    pdf.line(sideX2, topY + view.bendRadius_mm * scale / 1000, sideX2, armY); // right side
    pdf.line(sideX2, armY, rightX, armY); // right arm
    // Top arc (semicircle, ~20 line segments)
    const arcR = (sideX2 - sideX1) / 2;
    const arcCx = (sideX1 + sideX2) / 2;
    const arcCy = topY + view.bendRadius_mm * scale / 1000;
    let prevX = sideX1;
    let prevY = arcCy;
    for (let i = 1; i <= 20; i += 1) {
      const t = (i / 20) * Math.PI;
      const px = arcCx - arcR * Math.cos(t);
      const py = arcCy - arcR * Math.sin(t);
      pdf.line(prevX, prevY, px, py);
      prevX = px;
      prevY = py;
    }
  } else if (view.variant === "bellow") {
    // Bellow: accordion zigzag mid-span.
    const armY = anchorYBase;
    const bellowLen = view.span_m * scale * 0.4;
    const bellowStart = cx - bellowLen / 2;
    const bellowEnd = cx + bellowLen / 2;
    pdf.line(leftX, armY, bellowStart, armY);
    pdf.line(bellowEnd, armY, rightX, armY);
    // Accordion
    const folds = 8;
    const amp = 3;
    let prevX = bellowStart;
    let prevY = armY;
    for (let i = 1; i <= folds; i += 1) {
      const x1 = bellowStart + (bellowLen * i) / folds;
      const y1 = armY + (i % 2 === 0 ? amp : -amp);
      pdf.line(prevX, prevY, x1, y1);
      prevX = x1;
      prevY = y1;
    }
    pdf.line(prevX, prevY, bellowEnd, armY);
  } else {
    // Axial / other — straight sleeve with collar mid-span.
    const armY = anchorYBase;
    pdf.line(leftX, armY, rightX, armY);
    const collarLen = view.span_m * scale * 0.25;
    const collarStart = cx - collarLen / 2;
    pdf.setFillColor(220, 220, 230);
    pdf.setDrawColor(80, 80, 80);
    pdf.setLineWidth(0.3);
    pdf.rect(collarStart, armY - 2, collarLen, 4, "FD");
  }

  // Span dimension callout
  pdf.setDrawColor(20, 20, 20);
  pdf.setLineWidth(0.2);
  const dimY = anchorYBase + 16;
  pdf.line(leftX, dimY - 1, leftX, dimY + 1);
  pdf.line(rightX, dimY - 1, rightX, dimY + 1);
  pdf.line(leftX, dimY, rightX, dimY);
  pdf.setFontSize(8);
  pdf.setTextColor(20, 20, 20);
  pdf.text(`L = ${view.span_m.toFixed(2)} м`, cx, dimY + 4, { align: "center" });

  // Variant label
  pdf.setFontSize(10);
  pdf.setTextColor(20, 20, 20);
  pdf.text(`${view.label} — ${variantLabel(view.variant)}`, plotX, plotY + 8);

  // Expansion math table
  const tableY = plotY + plotH + 8;
  pdf.setFontSize(10);
  pdf.text("Дулааны уртасгалтын тооцоо", plotX, tableY);
  const tcols = [
    plotW * 0.45, plotW * 0.20, plotW * 0.20, plotW * 0.15,
  ];
  drawTableHeader(pdf, plotX, tableY + 4, tcols, ["Үзүүлэлт", "Утга", "Нэгж", "Тэмдэг"]);
  let rowY = tableY + 9;
  const rows: Array<[string, string, string, string]> = [
    ["Гангийн уртасгалтын коэф (α)", "1.2 × 10⁻⁵", "1/°C", "α"],
    ["Tемпературын өөрчлөлт", "75", "°C", "ΔT"],
    ["Анкер хоорондын зай", view.span_m.toFixed(2), "м", "L"],
    ["Тооцоологдсон уртасгалт", view.estimatedExpansion_mm.toFixed(1), "мм", "ΔL"],
    ["Тохирох ёстой нумын радиус", view.bendRadius_mm.toString(), "мм", "R"],
    ["Бүхэлдэхүүний хээр (arm)", view.armHeight_m.toFixed(2), "м", "h"],
  ];
  for (const r of rows) {
    drawTableRow(pdf, plotX, rowY, tcols, [r[0], r[1], r[2], r[3]]);
    rowY += 4.5;
  }

  // Advisory: bare bend-radius rule of thumb
  pdf.setFontSize(8);
  pdf.setTextColor(80, 30, 30);
  if (view.bendRadius_mm < view.estimatedExpansion_mm * 6) {
    pdf.text(
      `⚠ ГОСТ зөвлөмж: R ≥ 6 × ΔL = ${(view.estimatedExpansion_mm * 6).toFixed(0)} мм. Одоогийн R = ${view.bendRadius_mm} мм.`,
      plotX,
      rowY + 4,
    );
  } else {
    pdf.setTextColor(20, 100, 40);
    pdf.text(
      `✓ ГОСТ зөвлөмж хангагдсан: R = ${view.bendRadius_mm} мм ≥ 6 × ΔL = ${(view.estimatedExpansion_mm * 6).toFixed(0)} мм.`,
      plotX,
      rowY + 4,
    );
  }
  pdf.setTextColor(0, 0, 0);
}

/* ─── Page 6: УДДТ P&ID ─────────────────────────────────────────── */

/**
 * Render the УДДТ P&ID sheet — ladder layout from the source, ISA
 * S5.1 + ГОСТ 21.404 simplified symbols.
 */
export function renderPidPage(
  pdf: jsPDF,
  area: PageArea,
  state: HydraulicState,
): void {
  renderSheetTitle(pdf, area, "УДДТ — Process & Instrumentation", "Эх үүсвэрээс эхэлсэн авто схем");

  const layout = buildPidLayout(state.nodes, state.pipes);
  if ("error" in layout) {
    const banner = { x: area.x + 10, y: area.y + 30, width: area.width - 20, height: 40 };
    renderErrorBanner(pdf, banner, "P&ID гаргах боломжгүй", layout.error);
    return;
  }
  drawPidLayout(pdf, area, layout);
}

function drawPidLayout(pdf: jsPDF, area: PageArea, layout: PidLayout): void {
  // Stats strip
  const counts = new Map<string, number>();
  for (const e of layout.elements) counts.set(e.role, (counts.get(e.role) ?? 0) + 1);
  pdf.setFontSize(8);
  pdf.setTextColor(60, 60, 60);
  pdf.text(
    `Эх үүсвэр ${counts.get("source") ?? 0}  ·  Насос ${counts.get("pump") ?? 0}  ·  Арматура ${counts.get("valve") ?? 0}  ·  Мэдрэгч ${counts.get("sensor") ?? 0}  ·  Хэрэглэгч ${counts.get("consumer") ?? 0}  ·  Багана ${layout.columns}`,
    area.x + area.width / 2,
    area.y + 18,
    { align: "center" },
  );

  // Layout area
  const plot: PageArea = {
    x: area.x + 12,
    y: area.y + 28,
    width: area.width - 24,
    height: area.height - 50,
  };
  // Column step: width / max(columns, 1)
  const colStep = layout.columns > 1 ? plot.width / (layout.columns + 0.5) : plot.width / 2;
  const trunkY = plot.y + plot.height * 0.55;
  const sensorY = trunkY - plot.height * 0.32;

  const xyOf = (el: PidElement): { x: number; y: number } => ({
    x: plot.x + (el.column + 0.5) * colStep,
    y: el.row === -1 ? sensorY : trunkY,
  });

  // Edges first (orthogonal routing)
  for (const e of layout.edges) {
    const from = layout.elements.find((x) => x.nodeId === e.fromId);
    const to = layout.elements.find((x) => x.nodeId === e.toId);
    if (!from || !to) continue;
    const a = xyOf(from);
    const b = xyOf(to);
    // Colour by circuit
    if (e.circuit === "heating_supply") pdf.setDrawColor(163, 45, 45);
    else if (e.circuit === "heating_return") pdf.setDrawColor(31, 95, 170);
    else pdf.setDrawColor(95, 94, 90);
    pdf.setLineWidth(0.6);
    if (Math.abs(a.y - b.y) < 0.5) {
      pdf.line(a.x, a.y, b.x, b.y);
    } else {
      // L-route: horizontal first then vertical
      pdf.line(a.x, a.y, b.x, a.y);
      pdf.line(b.x, a.y, b.x, b.y);
    }
  }

  // Symbols
  const symbolR = Math.min(6, colStep * 0.18);
  for (const el of layout.elements) {
    const { x, y } = xyOf(el);
    drawPidSymbol(pdf, el, x, y, symbolR);
    pdf.setFontSize(7);
    pdf.setTextColor(20, 20, 20);
    pdf.text(el.label, x, y + symbolR + 3.5, { align: "center" });
  }
}

function drawPidSymbol(pdf: jsPDF, el: PidElement, x: number, y: number, r: number): void {
  switch (el.role) {
    case "source":
      pdf.setFillColor(248, 230, 230);
      pdf.setDrawColor(163, 45, 45);
      pdf.setLineWidth(0.5);
      pdf.rect(x - r, y - r, r * 2, r * 2, "FD");
      pdf.setTextColor(163, 45, 45);
      pdf.setFontSize(7);
      pdf.text(el.symbol, x, y + 1.5, { align: "center" });
      break;
    case "pump":
      pdf.setFillColor(255, 255, 255);
      pdf.setDrawColor(31, 95, 170);
      pdf.setLineWidth(0.5);
      pdf.circle(x, y, r, "FD");
      pdf.setLineWidth(0.4);
      pdf.line(x - r + 1.2, y, x + r - 1.2, y);
      pdf.line(x + r - 2, y - 0.8, x + r - 1.2, y);
      pdf.line(x + r - 2, y + 0.8, x + r - 1.2, y);
      pdf.setTextColor(31, 95, 170);
      pdf.setFontSize(6);
      pdf.text("N", x, y - r - 1, { align: "center" });
      break;
    case "valve": {
      pdf.setFillColor(255, 255, 255);
      pdf.setDrawColor(186, 117, 23);
      pdf.setLineWidth(0.5);
      pdf.lines(
        [
          [r * 2, r],
          [0, -r * 2],
          [-r * 2, r],
          [0, r],
        ],
        x - r, y - r * 0.5,
        [1, 1],
        "FD",
        true,
      );
      break;
    }
    case "sensor":
      pdf.setFillColor(255, 255, 255);
      pdf.setDrawColor(24, 95, 165);
      pdf.setLineWidth(0.5);
      pdf.circle(x, y, r * 0.8, "FD");
      pdf.line(x - r * 0.7, y, x + r * 0.7, y);
      pdf.setTextColor(24, 95, 165);
      pdf.setFontSize(6);
      pdf.text(el.symbol, x, y + 1.5, { align: "center" });
      break;
    case "consumer":
      pdf.setFillColor(245, 250, 240);
      pdf.setDrawColor(60, 140, 60);
      pdf.setLineWidth(0.5);
      pdf.lines(
        [
          [0, -r * 0.5],
          [r, -r * 0.5],
          [r, r * 0.5],
          [0, r * 0.5],
          [-r * 2, 0],
        ],
        x - r, y + r * 0.5,
        [1, 1],
        "FD",
        true,
      );
      pdf.setTextColor(60, 140, 60);
      pdf.setFontSize(6);
      pdf.text(el.symbol, x, y + r + 4, { align: "center" });
      break;
    case "chamber":
      pdf.setFillColor(255, 255, 255);
      pdf.setDrawColor(80, 140, 80);
      pdf.setLineWidth(0.4);
      pdf.rect(x - r * 0.8, y - r * 0.6, r * 1.6, r * 1.2, "FD");
      break;
    case "junction":
    case "fitting":
      pdf.setFillColor(20, 20, 20);
      pdf.setDrawColor(20, 20, 20);
      pdf.circle(x, y, 0.8, "F");
      break;
    default:
      pdf.setFillColor(160, 160, 160);
      pdf.setDrawColor(160, 160, 160);
      pdf.circle(x, y, 0.6, "F");
  }
  pdf.setTextColor(0, 0, 0);
}

/* ─── Page bundle: legend re-export ─────────────────────────────── */

export function pidLegendText(): string[] {
  // For test / external consumer documentation.
  return [
    `Эх үүсвэр (${roleLabel("source")}) — улаан тэгш өнцөгт`,
    `Насос (${roleLabel("pump")}) — цэнхэр тойрог + сум`,
    `Арматура (${roleLabel("valve")}) — бороль (bowtie)`,
    `Мэдрэгч (${roleLabel("sensor")}) — ГОСТ тойрог + үсэг`,
    `Хэрэглэгч (${roleLabel("consumer")}) — ногоон байшин`,
  ];
}
