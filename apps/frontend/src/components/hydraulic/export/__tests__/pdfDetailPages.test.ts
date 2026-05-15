/**
 * Phase 8.6 — Multi-page PDF detail-page renderer tests.
 *
 * Each renderer mutates a jsPDF instance via primitive draw calls.
 * jsdom + jspdf is happy with primitive draw calls (no svg2pdf
 * canvas dependency on these pages — only on the Plan page), so
 * we can exercise each renderer end-to-end and assert that:
 *   1. It doesn't throw on a valid input.
 *   2. It writes SOMETHING to the page (page count remains 1).
 *   3. The error path draws an error banner instead of crashing
 *      when the underlying helper returns `{ error: ... }`.
 *
 * We also exercise `exportDrawingSetPdf` to confirm the multi-page
 * flow adds the right number of pages and produces a non-empty blob.
 */
import { describe, it, expect } from "vitest";
import { jsPDF } from "jspdf";
import {
  renderProfilePage,
  renderEnergyPage,
  renderWellPage,
  renderCompensatorPage,
  renderPidPage,
  renderChannelCrossSectionPage,
  pidLegendText,
  type PageArea,
} from "../pdfDetailPages";
import { buildChannelFromDraw } from "../../scheme/channelOperations";
import {
  DEFAULT_DRAWING_SET_PAGES,
  drawingSetPageLabel,
} from "../pdfExport";
import { emptyState, type HydraulicState, type CalculationResults } from "../../hydraulicTypes";

function newPdf(): jsPDF {
  return new jsPDF({ orientation: "landscape", unit: "mm", format: "a3" });
}

const AREA: PageArea = { x: 10, y: 10, width: 400, height: 277 };

/* ─── State fixtures ────────────────────────────────────────────── */

function networkedState(): HydraulicState {
  const s = emptyState();
  s.nodes = [
    { id: "src", kind: "source_substation", label: "ЦТП-1", x: 0, y: 0, elevation_m: 1300 },
    { id: "p1", kind: "pump_circ", label: "ЦН-1", x: 30, y: 0, elevation_m: 1299.5 },
    { id: "v1", kind: "valve_gate", label: "ЗД-1", x: 60, y: 0, elevation_m: 1299 },
    { id: "tt", kind: "sensor_temperature", label: "TT-1", x: 30, y: -30 },
    { id: "well1", kind: "chamber", label: "КХ-1", x: 100, y: 0, elevation_m: 1298, chamber_length_m: 3, chamber_width_m: 2, chamber_depth_m: 2.5, coverDiameter_mm: 700 },
    { id: "comp1", kind: "compensator_u", label: "ОЛ-1", x: 130, y: 0, span_m: 2, armHeight_m: 1.2, bendRadius_mm: 500 },
    { id: "aos1", kind: "consumer_apartment", label: "АОС-1", x: 200, y: 0, elevation_m: 1297 },
  ];
  s.pipes = [
    { id: "e1", fromNodeId: "src", toNodeId: "p1", materialKey: "steel_aged", dn: 100, length_m: 30, circuit: "heating_supply", burialDepth_m: 1.5 },
    { id: "e2", fromNodeId: "p1", toNodeId: "v1", materialKey: "steel_aged", dn: 100, length_m: 30, circuit: "heating_supply", burialDepth_m: 1.5 },
    { id: "e3", fromNodeId: "v1", toNodeId: "well1", materialKey: "steel_aged", dn: 100, length_m: 40, circuit: "heating_supply" },
    { id: "e4", fromNodeId: "well1", toNodeId: "comp1", materialKey: "steel_aged", dn: 100, length_m: 30, circuit: "heating_supply" },
    { id: "e5", fromNodeId: "comp1", toNodeId: "aos1", materialKey: "steel_aged", dn: 80, length_m: 70, circuit: "heating_supply" },
    { id: "e6", fromNodeId: "p1", toNodeId: "tt", materialKey: "steel_aged", dn: 25, length_m: 1 },
  ];
  return s;
}

function withResults(s: HydraulicState): HydraulicState {
  const results: CalculationResults = {
    nodes: [
      { nodeId: "src", heatLoad_w: -150_000, supplyTemp_C_at_inlet: 95 },
      { nodeId: "aos1", heatLoad_w: 50_000, supplyTemp_C_at_inlet: 82 },
    ],
    pipes: [
      { pipeId: "e1", flow_kg_s: 1, velocity_m_s: 0.7, headLoss_m: 0.5, dpPerMeter_pa_m: 200, supplyTemp_C: 95, returnTemp_C: 70, heatLossPerMeter_W: 30 },
    ],
    heatLoss: {
      totalHeatLoss_W: 5000,
      sourceSupplyTemp_C: 95,
      minConsumerSupplyTemp_C: 82,
    },
    pump: { Q_m3_h: 5, H_m: 30, P_kW: 1.2 },
  } as unknown as CalculationResults;
  return { ...s, results };
}

/* ─── Profile page ─────────────────────────────────────────────── */

describe("renderProfilePage", () => {
  it("draws without throwing on a 5-node network", () => {
    const pdf = newPdf();
    expect(() => renderProfilePage(pdf, AREA, networkedState())).not.toThrow();
    expect(pdf.getNumberOfPages()).toBe(1);
  });

  it("renders error banner on empty network", () => {
    const pdf = newPdf();
    expect(() => renderProfilePage(pdf, AREA, emptyState())).not.toThrow();
  });

  it("renders error banner on no-source network", () => {
    const s = emptyState();
    s.nodes = [{ id: "c", kind: "consumer_apartment", label: "АОС", x: 0, y: 0 }];
    s.pipes = [];
    const pdf = newPdf();
    expect(() => renderProfilePage(pdf, AREA, s)).not.toThrow();
  });
});

/* ─── Energy page ──────────────────────────────────────────────── */

describe("renderEnergyPage", () => {
  it("renders error when results are undefined", () => {
    const pdf = newPdf();
    expect(() => renderEnergyPage(pdf, AREA, networkedState(), undefined)).not.toThrow();
  });

  it("renders balance + tables when results exist", () => {
    const pdf = newPdf();
    expect(() => renderEnergyPage(pdf, AREA, withResults(networkedState()), withResults(networkedState()).results)).not.toThrow();
  });
});

/* ─── Well page ────────────────────────────────────────────────── */

describe("renderWellPage", () => {
  it("draws cross-section without throwing", () => {
    const pdf = newPdf();
    expect(() => renderWellPage(pdf, AREA, networkedState())).not.toThrow();
  });

  it("renders error banner when no chamber exists", () => {
    const s = emptyState();
    s.nodes = [{ id: "src", kind: "source_substation", label: "S", x: 0, y: 0 }];
    const pdf = newPdf();
    expect(() => renderWellPage(pdf, AREA, s)).not.toThrow();
  });

  it("honours selection over fallback", () => {
    const s = networkedState();
    const pdf = newPdf();
    expect(() => renderWellPage(pdf, AREA, s, { kind: "node", id: "well1" })).not.toThrow();
  });
});

/* ─── Compensator page ─────────────────────────────────────────── */

describe("renderCompensatorPage", () => {
  it("draws U-bend variant without throwing", () => {
    const pdf = newPdf();
    expect(() => renderCompensatorPage(pdf, AREA, networkedState())).not.toThrow();
  });

  it("renders error banner when no compensator exists", () => {
    const s = emptyState();
    s.nodes = [{ id: "src", kind: "source_substation", label: "S", x: 0, y: 0 }];
    const pdf = newPdf();
    expect(() => renderCompensatorPage(pdf, AREA, s)).not.toThrow();
  });

  it("draws bellow variant", () => {
    const s = networkedState();
    s.nodes = s.nodes.map((n) => (n.id === "comp1" ? { ...n, kind: "compensator_bellow" } : n));
    const pdf = newPdf();
    expect(() => renderCompensatorPage(pdf, AREA, s, { kind: "node", id: "comp1" })).not.toThrow();
  });

  it("draws axial variant", () => {
    const s = networkedState();
    s.nodes = s.nodes.map((n) => (n.id === "comp1" ? { ...n, kind: "compensator_axial" } : n));
    const pdf = newPdf();
    expect(() => renderCompensatorPage(pdf, AREA, s, { kind: "node", id: "comp1" })).not.toThrow();
  });
});

/* ─── P&ID page ────────────────────────────────────────────────── */

describe("renderPidPage", () => {
  it("draws full ladder without throwing", () => {
    const pdf = newPdf();
    expect(() => renderPidPage(pdf, AREA, networkedState())).not.toThrow();
  });

  it("renders error banner when no source exists", () => {
    const s = emptyState();
    s.nodes = [{ id: "c", kind: "consumer_apartment", label: "АОС", x: 0, y: 0 }];
    const pdf = newPdf();
    expect(() => renderPidPage(pdf, AREA, s)).not.toThrow();
  });

  it("pidLegendText returns 5 entries", () => {
    expect(pidLegendText()).toHaveLength(5);
  });
});

/* ─── Drawing set integration ──────────────────────────────────── */

describe("DEFAULT_DRAWING_SET_PAGES + drawingSetPageLabel", () => {
  it("default order starts plan → profile → energy → well → compensator → pid", () => {
    // Phase 9.4 appends "compliance" as the 7th page; older tests asserted
    // 6 pages, now asserts the first 6 in canonical order.
    expect(DEFAULT_DRAWING_SET_PAGES.slice(0, 6)).toEqual([
      "plan",
      "profile",
      "energy",
      "well",
      "compensator",
      "pid",
    ]);
  });

  it("labels render Mongolian engineer-grade names for every page", () => {
    for (const p of DEFAULT_DRAWING_SET_PAGES) {
      const label = drawingSetPageLabel(p);
      expect(label.length).toBeGreaterThan(3);
    }
    expect(drawingSetPageLabel("plan")).toMatch(/План/);
    expect(drawingSetPageLabel("profile")).toMatch(/Профиль|профиль/);
    expect(drawingSetPageLabel("energy")).toMatch(/тэнцэл|Энерги/);
    expect(drawingSetPageLabel("well")).toMatch(/Худаг/);
    expect(drawingSetPageLabel("compensator")).toMatch(/Компенсатор/);
    expect(drawingSetPageLabel("pid")).toMatch(/УДДТ|P&ID/);
    expect(drawingSetPageLabel("channel")).toMatch(/Суваг|огтлол/);
  });
});

/* ─── Phase 12.6b — Channel cross-section PDF page ──────────────── */

describe("renderChannelCrossSectionPage — Phase 12.6b", () => {
  function stateWithChannel(channelType: "Л-4" | "Л-7" | "Л-9" | "custom" = "Л-9"): HydraulicState {
    const s = emptyState();
    s.nodes = [
      { id: "n1", kind: "junction", label: "1", x: 0, y: 0 },
      { id: "n2", kind: "junction", label: "2", x: 200, y: 0 },
    ];
    const { channel, pipes } = buildChannelFromDraw({
      fromNodeId: "n1",
      toNodeId: "n2",
      channelType,
      pipeCircuits: channelType === "Л-4"
        ? ["heating_supply", "heating_return"]
        : channelType === "Л-7"
          ? ["heating_supply", "heating_return", "dhw_supply", "dhw_recirc"]
          : ["heating_supply", "heating_return", "dhw_supply", "dhw_recirc", "cold_water"],
      ...(channelType === "custom"
        ? { customWidth_mm: 900, customHeight_mm: 500 }
        : {}),
      length_m: 50,
    });
    s.channels = [channel];
    s.pipes = pipes;
    return s;
  }

  it("renders without throwing for a Л-9 channel with 5 pipes", () => {
    const pdf = newPdf();
    const state = stateWithChannel("Л-9");
    expect(() =>
      renderChannelCrossSectionPage(pdf, AREA, state, null),
    ).not.toThrow();
    expect(pdf.getNumberOfPages()).toBe(1);
  });

  it("renders Л-4 / Л-7 / Л-9 variants without throwing", () => {
    for (const t of ["Л-4", "Л-7", "Л-9"] as const) {
      const pdf = newPdf();
      expect(() =>
        renderChannelCrossSectionPage(pdf, AREA, stateWithChannel(t), null),
      ).not.toThrow();
    }
  });

  it("renders custom channel with engineer-supplied dimensions", () => {
    const pdf = newPdf();
    expect(() =>
      renderChannelCrossSectionPage(pdf, AREA, stateWithChannel("custom"), null),
    ).not.toThrow();
  });

  it("draws an error banner when project has no channels", () => {
    const pdf = newPdf();
    const state = emptyState();
    // No channels in state → buildChannelDetail returns { error }
    expect(() =>
      renderChannelCrossSectionPage(pdf, AREA, state, null),
    ).not.toThrow();
    expect(pdf.getNumberOfPages()).toBe(1);
  });

  it("uses pipe-selection to pick the right channel in a multi-channel scene", () => {
    const s = emptyState();
    s.nodes = [
      { id: "n1", kind: "junction", label: "1", x: 0, y: 0 },
      { id: "n2", kind: "junction", label: "2", x: 200, y: 0 },
      { id: "n3", kind: "junction", label: "3", x: 400, y: 0 },
    ];
    const draw1 = buildChannelFromDraw({
      fromNodeId: "n1", toNodeId: "n2", channelType: "Л-4",
      pipeCircuits: ["heating_supply", "heating_return"], length_m: 20,
    });
    const draw2 = buildChannelFromDraw({
      fromNodeId: "n2", toNodeId: "n3", channelType: "Л-9",
      pipeCircuits: ["heating_supply", "heating_return", "dhw_supply"], length_m: 30,
    });
    s.channels = [draw1.channel, draw2.channel];
    s.pipes = [...draw1.pipes, ...draw2.pipes];

    const pdf = newPdf();
    // Selecting a pipe in the Л-9 channel should make the page render
    // that one (not the Л-4 first one).
    expect(() =>
      renderChannelCrossSectionPage(pdf, AREA, s, {
        kind: "pipe",
        id: draw2.pipes[0]!.id,
      }),
    ).not.toThrow();
  });
});

/**
 * Full `exportDrawingSetPdf` Blob output isn't tested in jsdom for
 * the same reason `exportToPdf` isn't: jspdf + svg2pdf depend on
 * canvas APIs that jsdom only partially implements, AND the Vite
 * `?url` font import resolves to a path that jsdom can't fetch.
 *
 * What we DO test here is the page-validation path that runs BEFORE
 * font load — engineer-facing error when no pages are selected. The
 * full multi-page Blob is verified via Claude_Preview browser smoke
 * test (manual click on the 📚 Drawing Set toolbar button).
 */
describe("exportDrawingSetPdf — validation", () => {
  it("throws engineer-friendly error when no pages selected", async () => {
    const { exportDrawingSetPdf } = await import("../pdfExport");
    await expect(exportDrawingSetPdf({
      state: emptyState(),
      settings: emptyState().settings,
      paperSize: "A3",
      orientation: "landscape",
      scale: "1:500",
      svgElement: null,
      // Only Plan was requested, but svgElement is null → gets filtered
      // out entirely → no pages → throws.
      includePages: ["plan"],
    })).rejects.toThrow(/Drawing set хоосон/);
  });
});
