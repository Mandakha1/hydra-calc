/**
 * Phase 6.7.4 — PDF export tests.
 *
 * Pure-helper coverage + integration verification of the layer-
 * filtering + DOM-strip path. The full `exportToPdf` Blob output
 * isn't exercised here — jspdf + svg2pdf depend on canvas APIs that
 * jsdom only partially implements. The pure helpers below are the
 * ones the export pipeline composes; testing them directly gives
 * us confidence in the layer filter + DOM walk without dragging
 * jspdf's canvas dependency into the suite.
 *
 * The pdfExport module sits in a lazy chunk; manual build-time
 * verification confirms the chunk loads only on the "🖨 PDF" click.
 */
import { describe, it, expect } from "vitest";
import {
  collectPrintHiddenIds,
  stripNonPrintElements,
  drawingAreaMm,
} from "../pdfExport";
import { DEFAULT_LAYERS } from "../../scheme/layers";
import type {
  HydraulicState,
  ProjectSettings,
  SchemeAnnotation,
  SchemeConstructionLine,
  SchemeDimension,
} from "../../hydraulicTypes";
import { emptyState } from "../../hydraulicTypes";

/* ─── Fixtures ──────────────────────────────────────────────────── */

function makeState(overrides?: Partial<HydraulicState>): HydraulicState {
  return { ...emptyState(), ...overrides };
}

function makeSettings(overrides?: Partial<ProjectSettings>): ProjectSettings {
  return { ...emptyState().settings, ...overrides };
}

function makeDim(id: string, layerKey?: "D" | "C"): SchemeDimension {
  return {
    id,
    fromNodeId: "a",
    toNodeId: "b",
    offset_px: 30,
    layerKey: layerKey ?? "D",
  };
}

function makeCl(id: string, layerKey?: "C" | "D"): SchemeConstructionLine {
  return {
    id,
    from: { x: 0, y: 0 },
    to: { x: 10, y: 10 },
    layerKey: layerKey ?? "C",
  };
}

function makeAnno(id: string, layerKey?: "D" | "C"): SchemeAnnotation {
  return {
    id,
    x: 0,
    y: 0,
    text: "T",
    layerKey: layerKey ?? "D",
  };
}

/* ─── Layer-filtering math ──────────────────────────────────────── */

describe("collectPrintHiddenIds — Phase 6.7.4", () => {
  it("returns empty sets when all layers default to printVisible=true", () => {
    // Defaults: D2.1/D2.2/D3/D4/U1/D = true, C = false.
    const state = makeState({
      dimensions: [makeDim("d1", "D")],
      annotations: [makeAnno("a1", "D")],
      // Construction lines default to layer "C" → printVisible:false by default.
      constructionLines: [],
    });
    const settings = makeSettings();
    const r = collectPrintHiddenIds(state, settings);
    expect(r.dimensionIds.size).toBe(0);
    expect(r.constructionLineIds.size).toBe(0);
    expect(r.annotationIds.size).toBe(0);
  });

  it("hides default-C construction lines by drafting convention", () => {
    const state = makeState({
      constructionLines: [makeCl("c1"), makeCl("c2")],
    });
    const r = collectPrintHiddenIds(state, makeSettings());
    expect(r.constructionLineIds.has("c1")).toBe(true);
    expect(r.constructionLineIds.has("c2")).toBe(true);
  });

  it("includes construction lines moved to layer D in the print output", () => {
    const state = makeState({
      constructionLines: [makeCl("c1", "D")],
    });
    const r = collectPrintHiddenIds(state, makeSettings());
    expect(r.constructionLineIds.has("c1")).toBe(false);
  });

  it("respects engineer override that hides layer D in print", () => {
    const state = makeState({
      dimensions: [makeDim("d1", "D")],
      annotations: [makeAnno("a1", "D")],
    });
    const settings = makeSettings({
      layers: { D: { printVisible: false } },
    });
    const r = collectPrintHiddenIds(state, settings);
    expect(r.dimensionIds.has("d1")).toBe(true);
    expect(r.annotationIds.has("a1")).toBe(true);
  });

  it("override printVisible=true on layer C reveals construction lines in print", () => {
    const state = makeState({
      constructionLines: [makeCl("c1")],
    });
    const settings = makeSettings({
      layers: { C: { printVisible: true } },
    });
    const r = collectPrintHiddenIds(state, settings);
    expect(r.constructionLineIds.has("c1")).toBe(false);
  });
});

/* ─── DOM-strip path ───────────────────────────────────────────── */

describe("stripNonPrintElements — Phase 6.7.4", () => {
  function makeSvg(): SVGSVGElement {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const ids = [
      "dimension-d1",
      "dimension-d2",
      "construction-line-c1",
      "annotation-a1",
      "scale-bar",
      "title-block",
      "north-arrow",
    ];
    for (const id of ids) {
      const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
      g.setAttribute("data-testid", id);
      svg.appendChild(g);
    }
    return svg;
  }

  it("removes only the hidden dimension/CL/annotation IDs", () => {
    const svg = makeSvg();
    stripNonPrintElements(svg, {
      dimensionIds: new Set(["d2"]),
      constructionLineIds: new Set(["c1"]),
      annotationIds: new Set(),
    });
    expect(svg.querySelector('[data-testid="dimension-d1"]')).not.toBeNull();
    expect(svg.querySelector('[data-testid="dimension-d2"]')).toBeNull();
    expect(svg.querySelector('[data-testid="construction-line-c1"]')).toBeNull();
    expect(svg.querySelector('[data-testid="annotation-a1"]')).not.toBeNull();
  });

  it("ALWAYS strips canvas-only preview widgets (scale bar / title block / north arrow)", () => {
    const svg = makeSvg();
    stripNonPrintElements(svg, {
      dimensionIds: new Set(),
      constructionLineIds: new Set(),
      annotationIds: new Set(),
    });
    expect(svg.querySelector('[data-testid="scale-bar"]')).toBeNull();
    expect(svg.querySelector('[data-testid="title-block"]')).toBeNull();
    expect(svg.querySelector('[data-testid="north-arrow"]')).toBeNull();
  });

  it("is idempotent — running twice doesn't error", () => {
    const svg = makeSvg();
    const hidden = {
      dimensionIds: new Set(["d1"]),
      constructionLineIds: new Set<string>(),
      annotationIds: new Set<string>(),
    };
    stripNonPrintElements(svg, hidden);
    expect(() => stripNonPrintElements(svg, hidden)).not.toThrow();
  });
});

/* ─── Paper layout math ────────────────────────────────────────── */

describe("drawingAreaMm — Phase 6.7.4", () => {
  it("subtracts 10 mm margin on each side for A3 landscape", () => {
    const a = drawingAreaMm("A3", "landscape");
    expect(a.x).toBe(10);
    expect(a.y).toBe(10);
    expect(a.width).toBe(420 - 20);
    expect(a.height).toBe(297 - 20);
  });

  it("A4 portrait drawing area is 190×277 mm", () => {
    const a = drawingAreaMm("A4", "portrait");
    expect(a.width).toBe(190);
    expect(a.height).toBe(277);
  });
});

/* ─── Layer system: printVisible defaults + persistence ────────── */

describe("Layer printVisible defaults — Phase 6.7.4", () => {
  it("DEFAULT_LAYERS sets printVisible=true on every pipe-role layer + D", () => {
    for (const key of ["D2.1", "D2.2", "D3", "D4", "U1", "D"] as const) {
      expect(DEFAULT_LAYERS[key].printVisible).toBe(true);
    }
  });

  it("DEFAULT_LAYERS sets printVisible=false on layer C (construction)", () => {
    expect(DEFAULT_LAYERS.C.printVisible).toBe(false);
  });

  it("collectPrintHiddenIds reads layer defaults without explicit override", () => {
    // No `settings.layers` override, layer C with two CLs.
    const state = makeState({
      constructionLines: [makeCl("c1"), makeCl("c2")],
    });
    const settings = makeSettings();
    expect(settings.layers).toBeUndefined();
    const r = collectPrintHiddenIds(state, settings);
    expect(r.constructionLineIds.size).toBe(2);
  });
});
