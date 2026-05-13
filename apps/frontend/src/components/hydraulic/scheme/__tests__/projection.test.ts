/**
 * Phase 6.8.2 — pure projection math tests.
 *
 * Locks down `containerPointToSchemeXY` + `schemeXYToContainerPoint`
 * directly with synthetic rectangles — no DOM, no Leaflet. The geo
 * wrappers (`projectGeoToSchemeXY` / `unprojectSchemeXYToGeo`) are
 * thin Leaflet calls, exercised separately by the geo-anchoring
 * integration tests once we wire them into the SchemeEditor display
 * helpers.
 *
 * Invariants this file pins:
 *
 *   - Identity case: all-zero rects + ruler 0 + zoom 1 + pan (0,0)
 *     leaves the coords unchanged.
 *   - Ruler offset: scheme (0,0) corresponds to container (ruler,
 *     ruler) when the rects align — the ruler band eats the first
 *     `ruler` pixels.
 *   - Pan: scheme-space pans shift the scheme-coord by minus the
 *     pan amount (panning right shows points with negative x).
 *   - Zoom: a 2× zoom halves the scheme-coord delta for a given
 *     container delta.
 *   - Map rect offset: when the Leaflet map div is offset from the
 *     SVG origin, the scheme-coord adjusts by that offset.
 *   - Round trip: container → scheme → container is the identity
 *     under arbitrary (legal) inputs.
 *   - Round trip: scheme → container → scheme is the identity.
 */
import { describe, it, expect } from "vitest";
import {
  containerPointToSchemeXY,
  schemeXYToContainerPoint,
} from "../projection";

const zeroRect = { left: 0, top: 0 };

describe("containerPointToSchemeXY — pure math", () => {
  it("identity case: zero rects + zero ruler + zoom 1 + zero pan", () => {
    expect(
      containerPointToSchemeXY(
        { x: 0, y: 0 },
        zeroRect,
        zeroRect,
        0,
        1,
        { x: 0, y: 0 },
      ),
    ).toEqual({ x: 0, y: 0 });
  });

  it("ruler offset: container (ruler, ruler) maps to scheme (0, 0)", () => {
    const r = 24;
    expect(
      containerPointToSchemeXY(
        { x: r, y: r },
        zeroRect,
        zeroRect,
        r,
        1,
        { x: 0, y: 0 },
      ),
    ).toEqual({ x: 0, y: 0 });
  });

  it("pan shifts the scheme-coord by minus the pan amount", () => {
    const out = containerPointToSchemeXY(
      { x: 24, y: 24 },
      zeroRect,
      zeroRect,
      24,
      1,
      { x: 50, y: 30 },
    );
    expect(out).toEqual({ x: -50, y: -30 });
  });

  it("2× zoom halves the scheme-coord delta for a given container delta", () => {
    // ruler 0, pan 0, zoom 2 → scheme = container / 2.
    expect(
      containerPointToSchemeXY(
        { x: 48, y: 100 },
        zeroRect,
        zeroRect,
        0,
        2,
        { x: 0, y: 0 },
      ),
    ).toEqual({ x: 24, y: 50 });
  });

  it("map-rect offset shifts scheme-coord by the same amount", () => {
    // mapRect.left = 100 means the map sits 100 px to the right of the
    // viewport origin; for the same container point, the scheme-space
    // value is 100 larger.
    const out = containerPointToSchemeXY(
      { x: 10, y: 5 },
      { left: 100, top: 60 },
      zeroRect,
      0,
      1,
      { x: 0, y: 0 },
    );
    expect(out).toEqual({ x: 110, y: 65 });
  });

  it("svg-rect offset shifts scheme-coord by the opposite amount", () => {
    // svgRect.left = 30 means the SVG sits 30 px to the right of the
    // viewport origin; scheme-space subtracts that.
    const out = containerPointToSchemeXY(
      { x: 50, y: 50 },
      zeroRect,
      { left: 30, top: 20 },
      0,
      1,
      { x: 0, y: 0 },
    );
    expect(out).toEqual({ x: 20, y: 30 });
  });
});

describe("schemeXYToContainerPoint — pure math", () => {
  it("identity case", () => {
    expect(
      schemeXYToContainerPoint(
        { x: 0, y: 0 },
        zeroRect,
        zeroRect,
        0,
        1,
        { x: 0, y: 0 },
      ),
    ).toEqual({ x: 0, y: 0 });
  });

  it("scheme (0, 0) maps to container (ruler, ruler) under zero pan + zoom 1", () => {
    const r = 24;
    expect(
      schemeXYToContainerPoint(
        { x: 0, y: 0 },
        zeroRect,
        zeroRect,
        r,
        1,
        { x: 0, y: 0 },
      ),
    ).toEqual({ x: r, y: r });
  });

  it("pan: container = (scheme + pan) * zoom + ruler under aligned rects", () => {
    const out = schemeXYToContainerPoint(
      { x: 10, y: 20 },
      zeroRect,
      zeroRect,
      0,
      1,
      { x: 5, y: 7 },
    );
    expect(out).toEqual({ x: 15, y: 27 });
  });

  it("zoom amplifies the (scheme + pan) sum", () => {
    const out = schemeXYToContainerPoint(
      { x: 10, y: 20 },
      zeroRect,
      zeroRect,
      0,
      3,
      { x: 0, y: 0 },
    );
    expect(out).toEqual({ x: 30, y: 60 });
  });
});

describe("round-trip identity — container → scheme → container", () => {
  const cases: Array<{
    label: string;
    container: { x: number; y: number };
    mapRect: { left: number; top: number };
    svgRect: { left: number; top: number };
    rulerPx: number;
    zoom: number;
    pan: { x: number; y: number };
  }> = [
    {
      label: "all zeros",
      container: { x: 0, y: 0 },
      mapRect: zeroRect,
      svgRect: zeroRect,
      rulerPx: 0,
      zoom: 1,
      pan: { x: 0, y: 0 },
    },
    {
      label: "realistic UB-scheme view",
      container: { x: 312, y: 188 },
      mapRect: { left: 200, top: 80 },
      svgRect: { left: 200, top: 80 },
      rulerPx: 24,
      zoom: 1.5,
      pan: { x: 12.5, y: -7.25 },
    },
    {
      label: "high zoom + non-zero offsets",
      container: { x: 1024, y: 768 },
      mapRect: { left: 50, top: 50 },
      svgRect: { left: 50, top: 50 },
      rulerPx: 24,
      zoom: 4.2,
      pan: { x: 100, y: 75 },
    },
    {
      label: "negative pan + sub-pixel coords",
      container: { x: 0.5, y: 0.5 },
      mapRect: zeroRect,
      svgRect: zeroRect,
      rulerPx: 0,
      zoom: 2,
      pan: { x: -33.33, y: 17.71 },
    },
  ];

  for (const c of cases) {
    it(c.label, () => {
      const scheme = containerPointToSchemeXY(
        c.container,
        c.mapRect,
        c.svgRect,
        c.rulerPx,
        c.zoom,
        c.pan,
      );
      const back = schemeXYToContainerPoint(
        scheme,
        c.mapRect,
        c.svgRect,
        c.rulerPx,
        c.zoom,
        c.pan,
      );
      expect(back.x).toBeCloseTo(c.container.x, 9);
      expect(back.y).toBeCloseTo(c.container.y, 9);
    });
  }
});

describe("round-trip identity — scheme → container → scheme", () => {
  const cases = [
    {
      label: "origin",
      scheme: { x: 0, y: 0 },
      mapRect: zeroRect,
      svgRect: zeroRect,
      rulerPx: 24,
      zoom: 1,
      pan: { x: 0, y: 0 },
    },
    {
      label: "node placement after pan + zoom",
      scheme: { x: 250, y: -120 },
      mapRect: { left: 200, top: 80 },
      svgRect: { left: 200, top: 80 },
      rulerPx: 24,
      zoom: 0.8,
      pan: { x: 40, y: -10 },
    },
    {
      label: "extreme zoom-out",
      scheme: { x: 4000, y: 4000 },
      mapRect: zeroRect,
      svgRect: zeroRect,
      rulerPx: 24,
      zoom: 0.1,
      pan: { x: 200, y: 200 },
    },
  ];

  for (const c of cases) {
    it(c.label, () => {
      const container = schemeXYToContainerPoint(
        c.scheme,
        c.mapRect,
        c.svgRect,
        c.rulerPx,
        c.zoom,
        c.pan,
      );
      const back = containerPointToSchemeXY(
        container,
        c.mapRect,
        c.svgRect,
        c.rulerPx,
        c.zoom,
        c.pan,
      );
      expect(back.x).toBeCloseTo(c.scheme.x, 9);
      expect(back.y).toBeCloseTo(c.scheme.y, 9);
    });
  }
});

describe("agreement with SchemeEditor inline math (regression pin)", () => {
  // These cases reproduce the exact formula in SchemeEditor.tsx so
  // the helper is provably interchangeable with the existing inline
  // displayPos / svgToLatLon math during the cut-over.
  it("displayPos formula: (screen - svg.left - ruler) / zoom - pan", () => {
    const mapRect = { left: 100, top: 50 };
    const svgRect = { left: 80, top: 40 };
    const ruler = 24;
    const zoom = 1.5;
    const pan = { x: 10, y: 5 };
    const container = { x: 200, y: 150 };
    // Inline formula:
    const screenX = mapRect.left + container.x; // 300
    const screenY = mapRect.top + container.y; // 200
    const inlineX = (screenX - svgRect.left - ruler) / zoom - pan.x;
    const inlineY = (screenY - svgRect.top - ruler) / zoom - pan.y;
    const helper = containerPointToSchemeXY(
      container,
      mapRect,
      svgRect,
      ruler,
      zoom,
      pan,
    );
    expect(helper.x).toBeCloseTo(inlineX, 9);
    expect(helper.y).toBeCloseTo(inlineY, 9);
  });

  it("svgToLatLon formula: (scheme + pan) * zoom + ruler + svg.left → container", () => {
    const mapRect = { left: 100, top: 50 };
    const svgRect = { left: 80, top: 40 };
    const ruler = 24;
    const zoom = 1.5;
    const pan = { x: 10, y: 5 };
    const scheme = { x: 42, y: 67 };
    // Inline formula:
    const screenX = scheme.x * zoom + pan.x * zoom + ruler + svgRect.left;
    const screenY = scheme.y * zoom + pan.y * zoom + ruler + svgRect.top;
    const inlineContainerX = screenX - mapRect.left;
    const inlineContainerY = screenY - mapRect.top;
    const helper = schemeXYToContainerPoint(
      scheme,
      mapRect,
      svgRect,
      ruler,
      zoom,
      pan,
    );
    expect(helper.x).toBeCloseTo(inlineContainerX, 9);
    expect(helper.y).toBeCloseTo(inlineContainerY, 9);
  });
});
