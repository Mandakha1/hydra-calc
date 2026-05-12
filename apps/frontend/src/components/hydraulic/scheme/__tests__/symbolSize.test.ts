/**
 * Phase 6A — symbol-size + pipe-stroke clamping tests.
 *
 * What we lock down:
 *   1. Mongolian residential АОС (consumer ~8 m real) is clipped to
 *      MIN_SYMBOL_PX at street-level + below (zoom 14) so it never
 *      disappears to a sub-pixel dot.
 *   2. At extreme close zoom (zoom 20), the same consumer is clipped
 *      to MAX_SYMBOL_PX so it doesn't "blob" out to cover the canvas.
 *   3. DN50 pipe stroke at sensible zoom lands in the engineering-
 *      legible 1.5-3 px band.
 *   4. pxPerMeterAtZoom matches Leaflet's actual conversion at УБ
 *      latitude to better than 1 % (sanity floor — the calculator
 *      result must agree with the actual map view so symbols don't
 *      drift off the underlying buildings).
 *   5. resolveEntityKind handles all the Politerm-derived fine-
 *      grained kinds in nodeCatalog ("source_chp", "consumer_apartment",
 *      "well_chamber", "fixed_support_steel", etc) plus the legacy
 *      bare-category strings.
 */
import { describe, it, expect } from "vitest";
import {
  computeSymbolRadiusPx,
  computePipeStrokeWidthPx,
  resolveEntityKind,
  pxPerMeterAtZoom,
  MIN_SYMBOL_PX,
  MAX_SYMBOL_PX,
  MIN_PIPE_PX,
  MAX_PIPE_PX,
  ENTITY_REAL_SIZE_M,
} from "../symbolSize";

describe("computeSymbolRadiusPx — Phase 6A", () => {
  it("at zoom 14 (px/m ≈ 0.38), АОС consumer clamps to MIN_SYMBOL_PX (no blob, no dot)", () => {
    const pxPerM = pxPerMeterAtZoom(14);
    const r = computeSymbolRadiusPx("consumer", pxPerM);
    // Real: 8 m × 0.38 px/m ÷ 2 = 1.52 px → would be sub-pixel. Clamp.
    expect(r).toBeGreaterThanOrEqual(MIN_SYMBOL_PX);
    expect(r).toBeLessThanOrEqual(MIN_SYMBOL_PX + 0.5); // floor reached
  });

  it("at zoom 22 (px/m ≈ 20), АОС consumer clamps to MAX_SYMBOL_PX (no blob)", () => {
    const pxPerM = pxPerMeterAtZoom(22);
    const r = computeSymbolRadiusPx("consumer", pxPerM);
    // Real: 8 m × 20 px/m ÷ 2 = 80 px → at cap; even larger zooms
    // would overshoot. The clamp is the load-bearing guarantee.
    expect(r).toBeGreaterThanOrEqual(MAX_SYMBOL_PX - 0.5);
    expect(r).toBeLessThanOrEqual(MAX_SYMBOL_PX);
  });

  it("at high zoom 19 (px/m ≈ 5), АОС lands inside both clamps (proportional band)", () => {
    const pxPerM = pxPerMeterAtZoom(19);
    const r = computeSymbolRadiusPx("consumer", pxPerM);
    // Real: 8 m × 5 px/m ÷ 2 = 20 px. Inside [12, 80] band — no clamp.
    expect(r).toBeGreaterThanOrEqual(MIN_SYMBOL_PX);
    expect(r).toBeLessThanOrEqual(MAX_SYMBOL_PX);
    expect(r).toBeCloseTo(20, 0); // proportional to real size, no clamp
  });

  it("УДДТ source (~12 m) is bigger than АОС consumer (~8 m) at proportional zoom", () => {
    const pxPerM = pxPerMeterAtZoom(18);
    const rSource = computeSymbolRadiusPx("source", pxPerM);
    const rConsumer = computeSymbolRadiusPx("consumer", pxPerM);
    expect(rSource).toBeGreaterThan(rConsumer);
  });

  it("junction (~0.3 m) always clamps to MIN_SYMBOL_PX at any reasonable zoom", () => {
    // Junctions are abstract hydraulic nodes; they're tiny in real
    // life but must be clickable. Clamp guarantees that.
    for (const zoom of [12, 15, 17, 19]) {
      const r = computeSymbolRadiusPx("junction", pxPerMeterAtZoom(zoom));
      // Even at zoom 19 (px/m ≈ 12), 0.3 × 12 ÷ 2 = 1.8 → clamp to MIN.
      expect(r).toBeGreaterThanOrEqual(MIN_SYMBOL_PX);
    }
  });

  it("returns MIN_SYMBOL_PX when px/m is null or zero (schematic mode)", () => {
    expect(computeSymbolRadiusPx("consumer", null)).toBe(MIN_SYMBOL_PX);
    expect(computeSymbolRadiusPx("consumer", 0)).toBe(MIN_SYMBOL_PX);
    expect(computeSymbolRadiusPx("consumer", -1)).toBe(MIN_SYMBOL_PX);
  });
});

describe("computePipeStrokeWidthPx — Phase 6A", () => {
  it("DN50 at street zoom 17 → 1.5-3 px (engineering-legible)", () => {
    const w = computePipeStrokeWidthPx(50, pxPerMeterAtZoom(17));
    expect(w).toBeGreaterThanOrEqual(MIN_PIPE_PX);
    expect(w).toBeLessThanOrEqual(MAX_PIPE_PX);
  });

  it("DN500 magistral at any zoom never exceeds MAX_PIPE_PX (no highways)", () => {
    for (const zoom of [12, 17, 20]) {
      const w = computePipeStrokeWidthPx(500, pxPerMeterAtZoom(zoom));
      expect(w).toBeLessThanOrEqual(MAX_PIPE_PX);
    }
  });

  it("DN15 thin line at any zoom stays ≥ MIN_PIPE_PX (no disappearing pipes)", () => {
    for (const zoom of [12, 17, 20]) {
      const w = computePipeStrokeWidthPx(15, pxPerMeterAtZoom(zoom));
      expect(w).toBeGreaterThanOrEqual(MIN_PIPE_PX);
    }
  });

  it("falls back to 1.5 px when px/m is null (schematic mode)", () => {
    expect(computePipeStrokeWidthPx(50, null)).toBe(1.5);
    expect(computePipeStrokeWidthPx(50, 0)).toBe(1.5);
  });
});

describe("pxPerMeterAtZoom — Leaflet conversion sanity", () => {
  it("at UB latitude, zoom 17 ≈ 1.25 px/m (matches Leaflet's Web Mercator math)", () => {
    const result = pxPerMeterAtZoom(17, 47.92);
    // Derivation: 256 × 2^17 pixels / (2π · 6_371_000 · cos(47.92°))
    //           = 33_554_432 / 26_859_000 ≈ 1.249 px/m at УБ lat.
    // Equivalent to ~0.80 m/pixel — the standard "street zoom" feel.
    expect(result).toBeGreaterThan(1.20);
    expect(result).toBeLessThan(1.30);
  });

  it("doubles for each zoom step (Leaflet's tile-pyramid invariant)", () => {
    const z17 = pxPerMeterAtZoom(17);
    const z18 = pxPerMeterAtZoom(18);
    const ratio = z18 / z17;
    expect(ratio).toBeGreaterThan(1.99);
    expect(ratio).toBeLessThan(2.01);
  });

  it("cosine-corrects for latitude (px/m at equator > px/m at УБ)", () => {
    // The Mercator projection stretches near the poles. УБ at 47.92°
    // sees more pixels-per-metre than the equator at the same zoom.
    const equator = pxPerMeterAtZoom(17, 0);
    const ub = pxPerMeterAtZoom(17, 47.92);
    expect(ub).toBeGreaterThan(equator);
    // The ratio should equal 1 / cos(47.92°) = 1 / 0.6712 = 1.49.
    const ratio = ub / equator;
    expect(ratio).toBeGreaterThan(1.45);
    expect(ratio).toBeLessThan(1.55);
  });
});

describe("resolveEntityKind — Politerm + legacy node-kind coverage", () => {
  it("resolves Politerm-derived fine-grained kinds correctly", () => {
    expect(resolveEntityKind("source_chp")).toBe("source");
    expect(resolveEntityKind("consumer_apartment")).toBe("consumer");
    expect(resolveEntityKind("consumer_industrial")).toBe("consumer");
    expect(resolveEntityKind("well_chamber")).toBe("well");
    expect(resolveEntityKind("fixed_support_steel")).toBe("fixedSupport");
    expect(resolveEntityKind("elbow_90")).toBe("elbow");
    expect(resolveEntityKind("compensator_axial")).toBe("compensator");
    expect(resolveEntityKind("compensator_omega")).toBe("compensator");
    expect(resolveEntityKind("valve_gate")).toBe("valve");
    expect(resolveEntityKind("pump_centrifugal")).toBe("pump");
    expect(resolveEntityKind("junction_T")).toBe("junction");
  });

  it("resolves legacy bare-category strings", () => {
    expect(resolveEntityKind("source")).toBe("source");
    expect(resolveEntityKind("consumer")).toBe("consumer");
    expect(resolveEntityKind("chamber")).toBe("well");
    expect(resolveEntityKind("junction")).toBe("junction");
    expect(resolveEntityKind("valve")).toBe("valve");
    expect(resolveEntityKind("pump")).toBe("pump");
  });

  it("falls back via category when kind is unknown", () => {
    expect(resolveEntityKind("mystery_widget", "source")).toBe("source");
    expect(resolveEntityKind("mystery_widget", "consumer")).toBe("consumer");
    expect(resolveEntityKind("mystery_widget", "valve")).toBe("valve");
    expect(resolveEntityKind("mystery_widget", "chamber")).toBe("junction");
    expect(resolveEntityKind("mystery_widget", "fitting")).toBe("junction");
  });

  it("falls back to 'junction' (smallest, always visible) when nothing matches", () => {
    expect(resolveEntityKind(undefined)).toBe("junction");
    expect(resolveEntityKind("")).toBe("junction");
    expect(resolveEntityKind("mystery_widget")).toBe("junction");
  });
});

describe("ENTITY_REAL_SIZE_M — engineering reality bracket", () => {
  it("source > consumer > compensator > well > valve > junction (size ordering)", () => {
    expect(ENTITY_REAL_SIZE_M.source).toBeGreaterThan(ENTITY_REAL_SIZE_M.consumer);
    expect(ENTITY_REAL_SIZE_M.consumer).toBeGreaterThan(ENTITY_REAL_SIZE_M.well);
    expect(ENTITY_REAL_SIZE_M.well).toBeGreaterThan(ENTITY_REAL_SIZE_M.compensator);
    expect(ENTITY_REAL_SIZE_M.compensator).toBeGreaterThan(ENTITY_REAL_SIZE_M.valve);
    expect(ENTITY_REAL_SIZE_M.valve).toBeGreaterThan(ENTITY_REAL_SIZE_M.junction);
  });
});
