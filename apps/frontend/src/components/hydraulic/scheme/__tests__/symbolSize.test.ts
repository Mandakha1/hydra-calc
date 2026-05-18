/**
 * Phase 6A + 6.8.3 — symbol-size + pipe-stroke clamping tests.
 *
 * What we lock down:
 *   1. Mongolian residential АОС (consumer, ~35 m real after the
 *      Phase 6.8.3 calibration) is clipped to MIN_SYMBOL_PX at
 *      low zoom (zoom 12) so it never disappears to a sub-pixel dot.
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
 *   6. Phase 6.8.3 — symbol-size preset (small/medium/large) +
 *      per-entity `size_scale` override compose multiplicatively
 *      and still clamp to MIN/MAX.
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
  SYMBOL_SIZE_PRESETS,
  DEFAULT_SYMBOL_SIZE_PRESET,
} from "../symbolSize";

describe("computeSymbolRadiusPx — Phase 6A / 6.8.3", () => {
  it("at zoom 12 (px/m ≈ 0.095), АОС consumer clamps to MIN_SYMBOL_PX (no sub-pixel dot)", () => {
    const pxPerM = pxPerMeterAtZoom(12);
    const r = computeSymbolRadiusPx("consumer", pxPerM);
    // Real: 35 m × 0.095 px/m ÷ 2 ≈ 1.66 px → would be sub-pixel. Clamp.
    expect(r).toBeGreaterThanOrEqual(MIN_SYMBOL_PX);
    expect(r).toBeLessThanOrEqual(MIN_SYMBOL_PX + 0.5); // floor reached
  });

  it("at zoom 16 (px/m ≈ 0.62), Phase 6.8.3 АОС lands IN BAND (not clamped)", () => {
    // PRE-CALIBRATION (Phase 6A): consumer 8 m × 0.62 / 2 = 2.5 px →
    // clamped to MIN. Every entity at zoom 16 looked the same size.
    // POST-CALIBRATION (6.8.3): 35 m × 0.62 / 2 ≈ 10.9 px → no clamp,
    // visibly bigger than a junction marker. This test pins the new
    // calibration so a future shrink wouldn't silently regress.
    const pxPerM = pxPerMeterAtZoom(16);
    const r = computeSymbolRadiusPx("consumer", pxPerM);
    expect(r).toBeGreaterThan(MIN_SYMBOL_PX);
    expect(r).toBeLessThan(MAX_SYMBOL_PX);
    expect(r).toBeCloseTo(10.9, 0);
  });

  it("at zoom 22 (px/m ≈ 20), АОС consumer clamps to MAX_SYMBOL_PX (no blob)", () => {
    const pxPerM = pxPerMeterAtZoom(22);
    const r = computeSymbolRadiusPx("consumer", pxPerM);
    // Real: 35 m × 20 px/m ÷ 2 = 350 px → would overshoot. Clamp.
    expect(r).toBeGreaterThanOrEqual(MAX_SYMBOL_PX - 0.5);
    expect(r).toBeLessThanOrEqual(MAX_SYMBOL_PX);
  });

  it("УДДТ source (18 m) is smaller than АОС consumer (35 m) at proportional zoom", () => {
    // Engineering reality: a heat substation cabin sits inside a single
    // building footprint while an apartment block stretches across one.
    // The 6.8.3 calibration makes consumer > source — the opposite of
    // the legacy 12 m / 8 m configuration.
    const pxPerM = pxPerMeterAtZoom(18);
    const rSource = computeSymbolRadiusPx("source", pxPerM);
    const rConsumer = computeSymbolRadiusPx("consumer", pxPerM);
    expect(rConsumer).toBeGreaterThan(rSource);
  });

  it("junction (~0.3 m) always clamps to MIN_SYMBOL_PX at any reasonable zoom", () => {
    // Junctions are abstract hydraulic nodes; they're tiny in real
    // life but must be clickable. Clamp guarantees that.
    for (const zoom of [12, 15, 17, 19]) {
      const r = computeSymbolRadiusPx("junction", pxPerMeterAtZoom(zoom));
      // 0.3 × pxPerM / 2 saturates the MIN_SYMBOL_PX floor at every
      // sane zoom — junctions look like junctions, never apartments.
      expect(r).toBeGreaterThanOrEqual(MIN_SYMBOL_PX);
    }
  });

  it("schematic mode (null px/m) returns MIN_SYMBOL_PX scaled by the preset", () => {
    // No map → fall back to MIN baseline. The 6.8.3 multiplier still
    // applies so a Small-preset on a no-map project visibly shrinks.
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

describe("ENTITY_REAL_SIZE_M — engineering reality bracket (Phase 6.8.3 calibration)", () => {
  it("consumer (АОС, 5-storey apartment) is the largest entity", () => {
    // Apartment ~35 m wide > heat substation ~18 m > everything else.
    expect(ENTITY_REAL_SIZE_M.consumer).toBeGreaterThan(ENTITY_REAL_SIZE_M.source);
    expect(ENTITY_REAL_SIZE_M.source).toBeGreaterThan(ENTITY_REAL_SIZE_M.well);
    expect(ENTITY_REAL_SIZE_M.well).toBeGreaterThan(ENTITY_REAL_SIZE_M.compensator);
    expect(ENTITY_REAL_SIZE_M.compensator).toBeGreaterThan(ENTITY_REAL_SIZE_M.valve);
    expect(ENTITY_REAL_SIZE_M.valve).toBeGreaterThan(ENTITY_REAL_SIZE_M.junction);
  });

  it("АОС sits in the 30..40 m engineer-expected band", () => {
    expect(ENTITY_REAL_SIZE_M.consumer).toBeGreaterThanOrEqual(30);
    expect(ENTITY_REAL_SIZE_M.consumer).toBeLessThanOrEqual(40);
  });

  it("УДДТ / ЦТП sits in the 15..20 m engineer-expected band", () => {
    expect(ENTITY_REAL_SIZE_M.source).toBeGreaterThanOrEqual(15);
    expect(ENTITY_REAL_SIZE_M.source).toBeLessThanOrEqual(20);
  });
});

describe("symbol-size preset multipliers (Phase 6.8.3)", () => {
  it("SYMBOL_SIZE_PRESETS spans the engineer-requested range", () => {
    expect(SYMBOL_SIZE_PRESETS.small).toBeCloseTo(0.7, 6);
    expect(SYMBOL_SIZE_PRESETS.medium).toBeCloseTo(1.0, 6);
    expect(SYMBOL_SIZE_PRESETS.large).toBeCloseTo(1.3, 6);
    // Phase 13.0 — engineer feedback "Орон сууц / Эх үүсвэр хэт том"
    // added two extra tiers so the preset range covers both
    // overview-density and presentation-scale use cases.
    expect(SYMBOL_SIZE_PRESETS.xs).toBeCloseTo(0.5, 6);
    expect(SYMBOL_SIZE_PRESETS.xl).toBeCloseTo(1.6, 6);
  });

  it("DEFAULT_SYMBOL_SIZE_PRESET is 'medium' (preserves Phase 6A behaviour)", () => {
    expect(DEFAULT_SYMBOL_SIZE_PRESET).toBe("medium");
    expect(SYMBOL_SIZE_PRESETS[DEFAULT_SYMBOL_SIZE_PRESET]).toBe(1.0);
  });

  it("Small preset shrinks consumer radius vs Medium (both unclamped)", () => {
    const pxPerM = pxPerMeterAtZoom(17); // ~1.25 px/m at УБ — well inside the band
    const medium = computeSymbolRadiusPx("consumer", pxPerM, SYMBOL_SIZE_PRESETS.medium);
    const small = computeSymbolRadiusPx("consumer", pxPerM, SYMBOL_SIZE_PRESETS.small);
    expect(small).toBeLessThan(medium);
    expect(small / medium).toBeCloseTo(0.7, 1);
  });

  it("Large preset grows consumer radius vs Medium (both unclamped)", () => {
    const pxPerM = pxPerMeterAtZoom(17);
    const medium = computeSymbolRadiusPx("consumer", pxPerM, SYMBOL_SIZE_PRESETS.medium);
    const large = computeSymbolRadiusPx("consumer", pxPerM, SYMBOL_SIZE_PRESETS.large);
    expect(large).toBeGreaterThan(medium);
    expect(large / medium).toBeCloseTo(1.3, 1);
  });

  it("per-entity size_scale composes multiplicatively with the preset", () => {
    // Engineer dials Small preset (0.7) AND overrides this one node to
    // 1.5 — the composite multiplier is 0.7 × 1.5 = 1.05, so this
    // node ends up slightly larger than Medium-default + 1.0 override.
    const pxPerM = pxPerMeterAtZoom(17);
    const composite = SYMBOL_SIZE_PRESETS.small * 1.5;
    const r = computeSymbolRadiusPx("consumer", pxPerM, composite);
    const baselineMedium = computeSymbolRadiusPx("consumer", pxPerM, 1.0);
    expect(composite).toBeCloseTo(1.05, 6);
    expect(r).toBeCloseTo(baselineMedium * 1.05, 1);
  });

  it("preset still clamps to MAX_SYMBOL_PX at extreme close zoom", () => {
    // Large preset (1.3×) × consumer 35 m × pxPerM at zoom 22 (20 px/m)
    // / 2 = 455 px → would overshoot wildly. Clamp must hold.
    const r = computeSymbolRadiusPx("consumer", pxPerMeterAtZoom(22), SYMBOL_SIZE_PRESETS.large);
    expect(r).toBeLessThanOrEqual(MAX_SYMBOL_PX);
    expect(r).toBeGreaterThanOrEqual(MAX_SYMBOL_PX - 0.5);
  });

  it("preset still clamps to MIN_SYMBOL_PX at far zoom-out", () => {
    // Small preset (0.7×) × consumer 35 m × pxPerM at zoom 11 (0.05 px/m)
    // / 2 = 0.6 px → would disappear. Clamp catches it.
    const r = computeSymbolRadiusPx("consumer", pxPerMeterAtZoom(11), SYMBOL_SIZE_PRESETS.small);
    expect(r).toBeGreaterThanOrEqual(MIN_SYMBOL_PX);
  });

  it("legacy callers (no scaleMultiplier arg) get the medium baseline", () => {
    // Two-arg call signature must keep returning the same number as
    // an explicit 1.0 multiplier — backward compat.
    const pxPerM = pxPerMeterAtZoom(17);
    const legacy = computeSymbolRadiusPx("consumer", pxPerM);
    const explicit = computeSymbolRadiusPx("consumer", pxPerM, 1.0);
    expect(legacy).toBeCloseTo(explicit, 9);
  });

  it("schematic-mode (null px/m) also honours the preset multiplier", () => {
    // Engineer with the map off + Small preset SHOULD see smaller
    // symbols than Medium. The schematic-floor logic respects the
    // multiplier (but never below half the floor — keep it clickable).
    const medium = computeSymbolRadiusPx("consumer", null, SYMBOL_SIZE_PRESETS.medium);
    const small = computeSymbolRadiusPx("consumer", null, SYMBOL_SIZE_PRESETS.small);
    const large = computeSymbolRadiusPx("consumer", null, SYMBOL_SIZE_PRESETS.large);
    expect(small).toBeLessThan(medium);
    expect(large).toBeGreaterThan(medium);
  });

  it("multiplier = 0 falls back gracefully (no NaN, returns floor)", () => {
    // Defensive — a UI bug or typo could send 0; clamp must catch.
    const pxPerM = pxPerMeterAtZoom(17);
    const r = computeSymbolRadiusPx("consumer", pxPerM, 0);
    expect(r).toBeGreaterThanOrEqual(MIN_SYMBOL_PX);
  });
});

/* ─── Phase 13.0 — 5-tier expansion + keyboard shortcuts ──────── */

describe("steppedPreset — Phase 13.0 [ / ] keyboard stepper", () => {
  it("SYMBOL_SIZE_PRESET_ORDER lists 5 tiers smallest → largest", async () => {
    const mod = await import("../symbolSize");
    expect(mod.SYMBOL_SIZE_PRESET_ORDER).toEqual([
      "xs", "small", "medium", "large", "xl",
    ]);
  });

  it("SYMBOL_SIZE_PRESET_LABELS provides Mongolian copy for each tier", async () => {
    const mod = await import("../symbolSize");
    expect(mod.SYMBOL_SIZE_PRESET_LABELS.xs).toBe("Маш жижиг");
    expect(mod.SYMBOL_SIZE_PRESET_LABELS.small).toBe("Жижиг");
    expect(mod.SYMBOL_SIZE_PRESET_LABELS.medium).toBe("Дунд");
    expect(mod.SYMBOL_SIZE_PRESET_LABELS.large).toBe("Том");
    expect(mod.SYMBOL_SIZE_PRESET_LABELS.xl).toBe("Маш том");
  });

  it("steppedPreset decreases through the tier order", async () => {
    const { steppedPreset } = await import("../symbolSize");
    expect(steppedPreset("xl", "decrease")).toBe("large");
    expect(steppedPreset("large", "decrease")).toBe("medium");
    expect(steppedPreset("medium", "decrease")).toBe("small");
    expect(steppedPreset("small", "decrease")).toBe("xs");
  });

  it("steppedPreset increases through the tier order", async () => {
    const { steppedPreset } = await import("../symbolSize");
    expect(steppedPreset("xs", "increase")).toBe("small");
    expect(steppedPreset("small", "increase")).toBe("medium");
    expect(steppedPreset("medium", "increase")).toBe("large");
    expect(steppedPreset("large", "increase")).toBe("xl");
  });

  it("steppedPreset saturates at the bounds (xs stays xs on decrease, xl stays xl on increase)", async () => {
    const { steppedPreset } = await import("../symbolSize");
    expect(steppedPreset("xs", "decrease")).toBe("xs");
    expect(steppedPreset("xl", "increase")).toBe("xl");
  });

  it("steppedPreset falls back to default when current is undefined", async () => {
    const { steppedPreset } = await import("../symbolSize");
    // Undefined → treat as "medium", then step from there.
    expect(steppedPreset(undefined, "decrease")).toBe("small");
    expect(steppedPreset(undefined, "increase")).toBe("large");
  });

  it("Phase 13.0 — MIN_SYMBOL_PX lowered to 4 so XS can shrink below the Phase 6.8.3 floor", () => {
    expect(MIN_SYMBOL_PX).toBe(4);
  });
});
