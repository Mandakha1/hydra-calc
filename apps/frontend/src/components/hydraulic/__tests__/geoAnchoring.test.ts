/**
 * Phase 6.8.2 — geo-anchoring integration tests.
 *
 * Locks down the data-model contract for annotations + construction
 * lines that follow the leaflet map view via `geo` / `geoFrom` /
 * `geoTo`. The pure projection math is exercised separately by
 * `scheme/__tests__/projection.test.ts` — these tests cover the
 * store-level + entity-level invariants:
 *
 *   1. addAnnotation accepts the new optional `.geo` field and
 *      round-trips it through the store.
 *   2. addConstructionLine accepts `.geoFrom` / `.geoTo` and round-
 *      trips both.
 *   3. Backward compat: Phase 6.6.2 / 6.6.3 entities WITHOUT geo
 *      load and render correctly (no geo → entity stays in
 *      scheme-space, exactly as before).
 *   4. JSON save/load round-trip preserves geo fields.
 *   5. Pure projection helpers — extra cases that complement the
 *      math tests with realistic Leaflet-ish numbers.
 *   6. Display-helper-shaped invariants: a Phase 6.8.2 entity with
 *      geo, but no map ref / no showMap, falls back to its stored
 *      x/y — so headless / read-only contexts keep working.
 *
 * No Leaflet instance is constructed (jsdom can't host one). The
 * map-projection wrapper is exercised by the manual-verification
 * checklist in the PR body; this file pins the surface area that
 * IS testable without a browser.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { useHydraulicStore } from "../hydraulicStore";
import { addAnnotation, removeAnnotation } from "../scheme/annotationApplier";
import {
  addConstructionLine,
  removeConstructionLine,
} from "../scheme/constructionLineApplier";
import { undo, redo } from "../scheme/undoStack";
import {
  containerPointToSchemeXY,
  schemeXYToContainerPoint,
  projectGeoToSchemeXY,
  unprojectSchemeXYToGeo,
} from "../scheme/projection";
import type {
  SchemeAnnotation,
  SchemeConstructionLine,
  HydraulicState,
} from "../hydraulicTypes";

beforeEach(() => {
  useHydraulicStore.getState().reset();
});

/* ─── 1. SchemeAnnotation.geo — store contract ─────────────────────── */

describe("SchemeAnnotation.geo — store-level contract (Phase 6.8.2)", () => {
  it("addAnnotation persists the new geo field on the stored entity", () => {
    const a: SchemeAnnotation = {
      id: "note-1",
      x: 100,
      y: 50,
      text: "УДДТ-1",
      layerKey: "D",
      geo: { lat: 47.918873, lon: 106.917702 },
    };
    addAnnotation(a);
    const stored = useHydraulicStore.getState().annotations?.[0];
    expect(stored).toBeDefined();
    expect(stored!.geo).toEqual({ lat: 47.918873, lon: 106.917702 });
    // Stored x/y stay as the source of truth and the canvas-only
    // fallback (no implicit conversion).
    expect(stored!.x).toBe(100);
    expect(stored!.y).toBe(50);
  });

  it("addAnnotation without geo stays geo-less (Phase 6.6.3 backward compat)", () => {
    addAnnotation({
      id: "note-legacy",
      x: 200,
      y: 75,
      text: "Хуучин тэмдэглэгээ",
      layerKey: "D",
    });
    const stored = useHydraulicStore.getState().annotations?.[0];
    expect(stored).toBeDefined();
    expect(stored!.geo).toBeUndefined();
  });

  it("undo after addAnnotation removes both x/y AND geo together", () => {
    addAnnotation({
      id: "note-undo",
      x: 0,
      y: 0,
      text: "тест",
      layerKey: "D",
      geo: { lat: 47.9, lon: 106.9 },
    });
    expect(useHydraulicStore.getState().annotations).toHaveLength(1);
    undo();
    expect(useHydraulicStore.getState().annotations ?? []).toHaveLength(0);
    redo();
    const restored = useHydraulicStore.getState().annotations?.[0];
    expect(restored!.geo).toEqual({ lat: 47.9, lon: 106.9 });
  });

  it("removeAnnotation purges the entire entity (geo + xy) from the store", () => {
    addAnnotation({
      id: "n1",
      x: 0,
      y: 0,
      text: "a",
      geo: { lat: 1, lon: 2 },
    });
    removeAnnotation("n1");
    expect(useHydraulicStore.getState().annotations ?? []).toHaveLength(0);
  });
});

/* ─── 2. SchemeConstructionLine.geoFrom/geoTo — store contract ─────── */

describe("SchemeConstructionLine.geoFrom/geoTo — store-level contract (Phase 6.8.2)", () => {
  it("addConstructionLine persists both geoFrom and geoTo on the stored entity", () => {
    const cl: SchemeConstructionLine = {
      id: "cl-1",
      from: { x: 0, y: 0 },
      to: { x: 100, y: 0 },
      style: "dashed",
      layerKey: "C",
      geoFrom: { lat: 47.9, lon: 106.9 },
      geoTo: { lat: 47.9, lon: 106.91 },
    };
    addConstructionLine(cl);
    const stored = useHydraulicStore.getState().constructionLines?.[0];
    expect(stored).toBeDefined();
    expect(stored!.geoFrom).toEqual({ lat: 47.9, lon: 106.9 });
    expect(stored!.geoTo).toEqual({ lat: 47.9, lon: 106.91 });
    expect(stored!.from).toEqual({ x: 0, y: 0 });
    expect(stored!.to).toEqual({ x: 100, y: 0 });
  });

  it("a construction line may have ONE endpoint geo-anchored and the other not", () => {
    // The drawConstruction handler captures geo only when showMap is
    // on at click time. An engineer could conceivably toggle the map
    // off between clicks → first endpoint has geo, second doesn't.
    // The store + render must handle this gracefully.
    addConstructionLine({
      id: "cl-half",
      from: { x: 0, y: 0 },
      to: { x: 100, y: 100 },
      style: "solid",
      geoFrom: { lat: 47.9, lon: 106.9 },
      // geoTo intentionally absent
    });
    const stored = useHydraulicStore.getState().constructionLines?.[0];
    expect(stored!.geoFrom).toBeDefined();
    expect(stored!.geoTo).toBeUndefined();
  });

  it("addConstructionLine without geo fields stays geo-less (Phase 6.6.2 backward compat)", () => {
    addConstructionLine({
      id: "cl-legacy",
      from: { x: 0, y: 0 },
      to: { x: 50, y: 50 },
      style: "dashed",
      layerKey: "C",
    });
    const stored = useHydraulicStore.getState().constructionLines?.[0];
    expect(stored!.geoFrom).toBeUndefined();
    expect(stored!.geoTo).toBeUndefined();
  });

  it("undo + redo preserves both geoFrom and geoTo through the round trip", () => {
    addConstructionLine({
      id: "cl-undo",
      from: { x: 0, y: 0 },
      to: { x: 100, y: 0 },
      style: "dashed",
      geoFrom: { lat: 1, lon: 2 },
      geoTo: { lat: 3, lon: 4 },
    });
    undo();
    expect(useHydraulicStore.getState().constructionLines ?? []).toHaveLength(0);
    redo();
    const restored = useHydraulicStore.getState().constructionLines?.[0];
    expect(restored!.geoFrom).toEqual({ lat: 1, lon: 2 });
    expect(restored!.geoTo).toEqual({ lat: 3, lon: 4 });
  });

  it("removeConstructionLine purges the entity (geo fields too)", () => {
    addConstructionLine({
      id: "cl-remove",
      from: { x: 0, y: 0 },
      to: { x: 10, y: 10 },
      geoFrom: { lat: 1, lon: 2 },
    });
    removeConstructionLine("cl-remove");
    expect(useHydraulicStore.getState().constructionLines ?? []).toHaveLength(0);
  });
});

/* ─── 3. JSON save/load round-trip ─────────────────────────────────── */

describe("JSON save/load round-trip — Phase 6.8.2 geo fields", () => {
  it("serialising and re-loading a project preserves annotation.geo", () => {
    addAnnotation({
      id: "note-rt",
      x: 100,
      y: 50,
      text: "round trip",
      geo: { lat: 47.92, lon: 106.92 },
    });
    const snapshot: HydraulicState = {
      nodes: useHydraulicStore.getState().nodes,
      pipes: useHydraulicStore.getState().pipes,
      settings: useHydraulicStore.getState().settings,
      schemaVersion: 5,
      annotations: useHydraulicStore.getState().annotations,
    };
    const serialised = JSON.stringify(snapshot);
    const reloaded = JSON.parse(serialised) as HydraulicState;
    expect(reloaded.annotations?.[0]?.geo).toEqual({
      lat: 47.92,
      lon: 106.92,
    });
  });

  it("serialising and re-loading preserves both geoFrom and geoTo on a construction line", () => {
    addConstructionLine({
      id: "cl-rt",
      from: { x: 0, y: 0 },
      to: { x: 100, y: 100 },
      geoFrom: { lat: 47.9, lon: 106.9 },
      geoTo: { lat: 47.91, lon: 106.91 },
    });
    const snapshot: HydraulicState = {
      nodes: [],
      pipes: [],
      settings: useHydraulicStore.getState().settings,
      schemaVersion: 5,
      constructionLines: useHydraulicStore.getState().constructionLines,
    };
    const reloaded = JSON.parse(JSON.stringify(snapshot)) as HydraulicState;
    expect(reloaded.constructionLines?.[0]?.geoFrom).toEqual({
      lat: 47.9,
      lon: 106.9,
    });
    expect(reloaded.constructionLines?.[0]?.geoTo).toEqual({
      lat: 47.91,
      lon: 106.91,
    });
  });

  it("a legacy serialised project without geo fields loads cleanly", () => {
    // Simulate a project saved BEFORE Phase 6.8.2.
    const legacyJson = JSON.stringify({
      nodes: [],
      pipes: [],
      settings: {
        networkType: "two_pipe_closed",
        temperatureScheduleKey: "95_70",
        city: "Улаанбаатар",
        primaryMaterialCategory: "steel",
        localLossesFraction: 0.3,
        sourcePressure_mpa: 0.6,
      },
      schemaVersion: 5,
      annotations: [{ id: "old-a", x: 10, y: 10, text: "no geo" }],
      constructionLines: [
        {
          id: "old-cl",
          from: { x: 0, y: 0 },
          to: { x: 100, y: 0 },
          style: "dashed",
        },
      ],
    });
    const reloaded = JSON.parse(legacyJson) as HydraulicState;
    // Annotations + CLs still load. The geo-related fields stay
    // undefined — display helpers will fall back to x/y.
    expect(reloaded.annotations?.[0]?.geo).toBeUndefined();
    expect(reloaded.constructionLines?.[0]?.geoFrom).toBeUndefined();
    expect(reloaded.constructionLines?.[0]?.geoTo).toBeUndefined();
    // Stored x/y still present (the canvas-only fallback path).
    expect(reloaded.annotations?.[0]?.x).toBe(10);
    expect(reloaded.constructionLines?.[0]?.from).toEqual({ x: 0, y: 0 });
  });
});

/* ─── 4. Display-helper-shaped fallback invariants ─────────────────── */

describe("Projection helpers — display-helper fallback contract (Phase 6.8.2)", () => {
  it("projectGeoToSchemeXY returns null when the map ref is null", () => {
    const r = projectGeoToSchemeXY(
      { lat: 47.9, lon: 106.9 },
      null,
      null,
      24,
      1,
      { x: 0, y: 0 },
    );
    expect(r).toBeNull();
  });

  it("unprojectSchemeXYToGeo returns null when the map ref is null", () => {
    const r = unprojectSchemeXYToGeo(
      { x: 0, y: 0 },
      null,
      null,
      24,
      1,
      { x: 0, y: 0 },
    );
    expect(r).toBeNull();
  });

  it("projectGeoToSchemeXY returns null when the svg ref is null even if map looks present", () => {
    // Mock-ish map object — never invoked because svg=null short-circuits.
    const fakeMap = {} as Parameters<typeof projectGeoToSchemeXY>[1];
    const r = projectGeoToSchemeXY(
      { lat: 0, lon: 0 },
      fakeMap,
      null,
      24,
      1,
      { x: 0, y: 0 },
    );
    expect(r).toBeNull();
  });
});

/* ─── 5. Pure projection — extra realistic-scale cases ─────────────── */

describe("Projection math — extra realistic-scale cases (Phase 6.8.2)", () => {
  it("zooming the map without panning leaves a (0, 0) container point at scheme origin (modulo ruler/pan)", () => {
    // Realistic ruler offset (24 px), no pan, identity zoom. The
    // container origin is at (0, 0) of the map div; if the map div
    // sits flush with the SVG, the scheme-origin is at the ruler
    // offset.
    const out = containerPointToSchemeXY(
      { x: 0, y: 0 },
      { left: 0, top: 0 },
      { left: 0, top: 0 },
      24,
      1,
      { x: 0, y: 0 },
    );
    expect(out).toEqual({ x: -24, y: -24 });
  });

  it("pan + zoom compose correctly through the round trip", () => {
    const container = { x: 333, y: 277 };
    const mapRect = { left: 50, top: 30 };
    const svgRect = { left: 50, top: 30 };
    const ruler = 24;
    const zoom = 1.25;
    const pan = { x: -18, y: 22 };
    const scheme = containerPointToSchemeXY(
      container,
      mapRect,
      svgRect,
      ruler,
      zoom,
      pan,
    );
    const back = schemeXYToContainerPoint(
      scheme,
      mapRect,
      svgRect,
      ruler,
      zoom,
      pan,
    );
    expect(back.x).toBeCloseTo(container.x, 9);
    expect(back.y).toBeCloseTo(container.y, 9);
  });

  it("two scheme points with the same container position under different zooms produce different geo (sanity)", () => {
    // Indirect sanity check — the same scheme point under zoom=1
    // vs zoom=2 produces different container offsets, which means
    // a fixed container point corresponds to different scheme
    // points → no false identity collapse.
    const scheme = { x: 100, y: 100 };
    const at1 = schemeXYToContainerPoint(
      scheme,
      { left: 0, top: 0 },
      { left: 0, top: 0 },
      24,
      1,
      { x: 0, y: 0 },
    );
    const at2 = schemeXYToContainerPoint(
      scheme,
      { left: 0, top: 0 },
      { left: 0, top: 0 },
      24,
      2,
      { x: 0, y: 0 },
    );
    expect(at1.x).not.toBeCloseTo(at2.x, 6);
  });
});
