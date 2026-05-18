/**
 * Phase 13.0b — Engineer feedback fix: building-rendered entities
 * (source_tec, consumer_industrial, anything with width_m≥6 && height_m≥6)
 * must honour the same scale multiplier as symbol-rendered nodes.
 *
 * BEFORE this fix:
 *   - source_tec defaults width_m=80, height_m=50
 *   - SchemeEditor render path: (cat==="source" && wm>=6 && hm>=6) → building
 *   - Building rect was wm × scaleFactor (× nothing else)
 *   - Inspector size_scale + project preset + [/] shortcut all ignored
 *
 * AFTER this fix:
 *   - Building rect is wm × scaleFactor × sizeScaleFactor
 *   - sizeScaleFactor = SYMBOL_SIZE_PRESETS[preset] × (node.size_scale ?? 1)
 *   - [/] shortcut + Inspector "Хэмжээний хувь" + SettingsPanel preset
 *     all now shrink/grow TЭЦ rectangles
 *
 * These tests cover the math invariants WITHOUT rendering SchemeEditor
 * (which depends on Leaflet + many other globals). The SchemeEditor
 * smoke test in SchemeEditor.test.tsx exercises end-to-end render.
 */
import { describe, it, expect } from "vitest";
import {
  SYMBOL_SIZE_PRESETS,
  steppedPreset,
} from "../scheme/symbolSize";

/** Mirror SchemeEditor's render-time math so the test stays in sync
 *  with the production path. When this diverges, the SchemeEditor
 *  test catches it. */
function buildingPixelDims(args: {
  width_m: number;
  height_m: number;
  pxPerMeter: number;
  presetMultiplier: number;
  perNodeScale: number;
}): { wpx: number; hpx: number } {
  const composite = args.presetMultiplier * args.perNodeScale;
  return {
    wpx: args.width_m * args.pxPerMeter * composite,
    hpx: args.height_m * args.pxPerMeter * composite,
  };
}

describe("Phase 13.0b — building render honours size_scale + preset", () => {
  it("ТЭЦ (source_tec 80×50 m) shrinks 50% under XS preset", () => {
    const medium = buildingPixelDims({
      width_m: 80, height_m: 50,
      pxPerMeter: 0.5,
      presetMultiplier: SYMBOL_SIZE_PRESETS.medium,
      perNodeScale: 1,
    });
    const xs = buildingPixelDims({
      width_m: 80, height_m: 50,
      pxPerMeter: 0.5,
      presetMultiplier: SYMBOL_SIZE_PRESETS.xs,
      perNodeScale: 1,
    });
    expect(xs.wpx / medium.wpx).toBeCloseTo(0.5, 2);
    expect(xs.hpx / medium.hpx).toBeCloseTo(0.5, 2);
  });

  it("ТЭЦ grows 60% under XL preset", () => {
    const medium = buildingPixelDims({
      width_m: 80, height_m: 50,
      pxPerMeter: 0.5,
      presetMultiplier: SYMBOL_SIZE_PRESETS.medium,
      perNodeScale: 1,
    });
    const xl = buildingPixelDims({
      width_m: 80, height_m: 50,
      pxPerMeter: 0.5,
      presetMultiplier: SYMBOL_SIZE_PRESETS.xl,
      perNodeScale: 1,
    });
    expect(xl.wpx / medium.wpx).toBeCloseTo(1.6, 2);
  });

  it("per-node size_scale composes with preset (0.7 × 0.5 = 0.35)", () => {
    const baseline = buildingPixelDims({
      width_m: 80, height_m: 50,
      pxPerMeter: 0.5,
      presetMultiplier: 1.0,
      perNodeScale: 1.0,
    });
    const composite = buildingPixelDims({
      width_m: 80, height_m: 50,
      pxPerMeter: 0.5,
      presetMultiplier: SYMBOL_SIZE_PRESETS.small, // 0.7
      perNodeScale: 0.5, // engineer override
    });
    expect(composite.wpx / baseline.wpx).toBeCloseTo(0.35, 2);
  });

  it("[/] key sequence: pressing [ twice from medium lands at XS (50%)", () => {
    let preset = steppedPreset(undefined, "decrease"); // medium → small
    preset = steppedPreset(preset, "decrease");         // small → xs
    expect(preset).toBe("xs");
    expect(SYMBOL_SIZE_PRESETS[preset]).toBe(0.5);
  });

  it("[/] key sequence: pressing ] twice from medium lands at XL (160%)", () => {
    let preset = steppedPreset(undefined, "increase"); // medium → large
    preset = steppedPreset(preset, "increase");         // large → xl
    expect(preset).toBe("xl");
    expect(SYMBOL_SIZE_PRESETS[preset]).toBe(1.6);
  });

  it("engineer-stale preset 'medium' + node.size_scale=0.4 produces a 40% ТЭЦ", () => {
    // Engineer fix: don't touch preset (keep medium for other entities),
    // just dial down ONE ТЭЦ via Inspector size_scale.
    const baseline = buildingPixelDims({
      width_m: 80, height_m: 50,
      pxPerMeter: 0.5,
      presetMultiplier: 1.0, perNodeScale: 1.0,
    });
    const tamed = buildingPixelDims({
      width_m: 80, height_m: 50,
      pxPerMeter: 0.5,
      presetMultiplier: 1.0, perNodeScale: 0.4,
    });
    expect(tamed.wpx / baseline.wpx).toBeCloseTo(0.4, 2);
  });

  it("preset 1.0 + scale 1.0 = identity (no regression for default workflow)", () => {
    const id = buildingPixelDims({
      width_m: 80, height_m: 50,
      pxPerMeter: 0.5,
      presetMultiplier: 1.0, perNodeScale: 1.0,
    });
    expect(id.wpx).toBe(40);
    expect(id.hpx).toBe(25);
  });
});
