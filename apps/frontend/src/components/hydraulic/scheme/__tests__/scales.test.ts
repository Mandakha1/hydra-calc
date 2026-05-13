/**
 * Phase 6.7.1 — Scale + paper math tests.
 *
 * Pure-function tests for the scale-bar foundation. UI integration is
 * verified separately via the store + Settings panel.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  STANDARD_SCALES,
  DEFAULT_SCALE,
  DEFAULT_PAPER_SIZE,
  DEFAULT_PAPER_ORIENTATION,
  paperDimensionsMm,
  parseScale,
  metresPerCentimetre,
  nearestStandardScale,
  scaleBarSegments,
  fitToPageScale,
  segmentLengthInSchemePx,
} from "../scales";
import { useHydraulicStore } from "../../hydraulicStore";
import { PX_PER_METER } from "../../nodeCatalog";

beforeEach(() => {
  useHydraulicStore.getState().reset();
});

describe("scale-string math — Phase 6.7.1", () => {
  it("parseScale extracts the N in 1:N", () => {
    expect(parseScale("1:200")).toBe(200);
    expect(parseScale("1:500")).toBe(500);
    expect(parseScale("1:1000")).toBe(1000);
    expect(parseScale("1:2000")).toBe(2000);
  });

  it("metresPerCentimetre returns N/100", () => {
    expect(metresPerCentimetre("1:200")).toBe(2);
    expect(metresPerCentimetre("1:500")).toBe(5);
    expect(metresPerCentimetre("1:1000")).toBe(10);
    expect(metresPerCentimetre("1:2000")).toBe(20);
  });

  it("STANDARD_SCALES covers the 4 supported drafting scales", () => {
    expect(STANDARD_SCALES).toEqual(["1:200", "1:500", "1:1000", "1:2000"]);
  });
});

describe("paper dimensions — Phase 6.7.1", () => {
  it("A3 landscape is 420×297 mm", () => {
    expect(paperDimensionsMm("A3", "landscape")).toEqual({ width: 420, height: 297 });
  });

  it("A3 portrait is 297×420 mm", () => {
    expect(paperDimensionsMm("A3", "portrait")).toEqual({ width: 297, height: 420 });
  });

  it("A4 landscape is 297×210 mm", () => {
    expect(paperDimensionsMm("A4", "landscape")).toEqual({ width: 297, height: 210 });
  });

  it("A4 portrait is 210×297 mm", () => {
    expect(paperDimensionsMm("A4", "portrait")).toEqual({ width: 210, height: 297 });
  });
});

describe("nearestStandardScale — Phase 6.7.1", () => {
  it("picks 1:500 when pxPerMeter is close to a 5m/cm screen", () => {
    // 96 DPI → 37.8 px/cm. At pxPerMeter = 7.56 → metresPerCm = 5 → 1:500.
    expect(nearestStandardScale(7.56)).toBe("1:500");
  });

  it("picks 1:2000 for very low pxPerMeter (zoomed out / city-scale)", () => {
    // Very zoomed out: pxPerMeter ~1 → metresPerCm ~37.8 → closer to 1:2000.
    expect(nearestStandardScale(1)).toBe("1:2000");
  });

  it("picks 1:200 for high pxPerMeter (zoomed in / floor-plan-scale)", () => {
    // Zoomed in: pxPerMeter ~30 → metresPerCm ~1.3 → closer to 1:200.
    expect(nearestStandardScale(30)).toBe("1:200");
  });
});

describe("scaleBarSegments — Phase 6.7.1", () => {
  it("returns exactly 5 entries (4 segments + zero mark)", () => {
    for (const scale of STANDARD_SCALES) {
      expect(scaleBarSegments(scale, 420)).toHaveLength(5);
    }
  });

  it("first segment is always the 0m mark", () => {
    const segs = scaleBarSegments("1:500", 420);
    expect(segs[0]!.metreValue).toBe(0);
    expect(segs[0]!.lengthOnPaper_mm).toBe(0);
  });

  it("segments are evenly spaced (constant step)", () => {
    const segs = scaleBarSegments("1:500", 420);
    const step = segs[1]!.metreValue - segs[0]!.metreValue;
    for (let i = 1; i < segs.length; i += 1) {
      expect(segs[i]!.metreValue - segs[i - 1]!.metreValue).toBe(step);
    }
  });

  it("uses a nice round step at 1:500 on A3 landscape", () => {
    // Expected step is 10 m (covers 40 m total in ~80 mm).
    const segs = scaleBarSegments("1:500", 420);
    expect(segs[1]!.metreValue).toBe(10);
    expect(segs[segs.length - 1]!.metreValue).toBe(40);
  });

  it("lengthOnPaper_mm scales with metreValue", () => {
    // At 1:500, 10 m = 10/5 = 2 cm = 20 mm.
    const segs = scaleBarSegments("1:500", 420);
    expect(segs[1]!.lengthOnPaper_mm).toBeCloseTo(20, 1);
    // 40 m = 80 mm.
    expect(segs[4]!.lengthOnPaper_mm).toBeCloseTo(80, 1);
  });

  it("picks a larger step at coarser scale (1:2000 → ~50 m / segment)", () => {
    const segs = scaleBarSegments("1:2000", 420);
    // At 1:2000, 84mm * 20m/cm = 168m total → step ≈ 42m → nice 25 or 50.
    // Either is acceptable; assert the step is ≥ 20 (definitely not 10).
    expect(segs[1]!.metreValue).toBeGreaterThanOrEqual(20);
  });
});

describe("segmentLengthInSchemePx — Phase 6.7.1", () => {
  it("multiplies metres by the default PX_PER_METER", () => {
    expect(segmentLengthInSchemePx(5)).toBe(5 * PX_PER_METER);
    expect(segmentLengthInSchemePx(50)).toBe(50 * PX_PER_METER);
  });

  it("honours a caller-supplied pxPerMeter (map-aware density)", () => {
    expect(segmentLengthInSchemePx(10, 7.5)).toBe(75);
  });
});

describe("fitToPageScale — Phase 6.7.1", () => {
  it("picks 1:200 for a small drawing on A4 portrait", () => {
    // 12 m × 8 m bbox = 240 px × 160 px at PX_PER_METER=20.
    // A4 portrait = 210×297 mm minus 60 reserved = 150×237 available.
    // At 1:200, 12 m = 60 mm wide. Fits easily.
    const s = fitToPageScale({ width: 240, height: 160 }, "A4", "portrait");
    expect(s).toBe("1:200");
  });

  it("picks 1:500 for a medium drawing on A3 landscape", () => {
    // 80 m × 40 m bbox = 1600 px × 800 px.
    // A3 landscape = 420×297 mm minus 60 = 360×237 available.
    // At 1:200, 80 m = 400 mm → doesn't fit width.
    // At 1:500, 80 m = 160 mm → fits.
    const s = fitToPageScale({ width: 1600, height: 800 }, "A3", "landscape");
    expect(s).toBe("1:500");
  });

  it("picks 1:1000 for a 250m residential network on A3 landscape", () => {
    // 250 m × 80 m bbox = 5000 px × 1600 px.
    // A3 landscape available = 360 mm.
    // At 1:500, 250 m = 500 mm → too wide.
    // At 1:1000, 250 m = 250 mm → fits.
    const s = fitToPageScale({ width: 5000, height: 1600 }, "A3", "landscape");
    expect(s).toBe("1:1000");
  });

  it("falls back to 1:2000 for huge drawings (GK-23/02 380m district)", () => {
    // 600 m × 400 m bbox = 12000 px × 8000 px.
    // At 1:2000 still 300 mm wide which fits A3 landscape (360 mm avail).
    const s = fitToPageScale({ width: 12000, height: 8000 }, "A3", "landscape");
    expect(s).toBe("1:2000");
  });
});

describe("Settings persistence — Phase 6.7.1", () => {
  it("printScale defaults are exposed for the editor", () => {
    expect(DEFAULT_SCALE).toBe("1:500");
    expect(DEFAULT_PAPER_SIZE).toBe("A3");
    expect(DEFAULT_PAPER_ORIENTATION).toBe("landscape");
  });

  it("fresh project has no printScale set (read site falls back to default)", () => {
    const s = useHydraulicStore.getState().settings;
    expect(s.printScale).toBeUndefined();
    expect(s.printPaperSize).toBeUndefined();
    expect(s.printOrientation).toBeUndefined();
  });

  it("updateSettings persists printScale + paper + orientation choices", () => {
    useHydraulicStore.getState().updateSettings({
      printScale: "1:1000",
      printPaperSize: "A4",
      printOrientation: "portrait",
    });
    const s = useHydraulicStore.getState().settings;
    expect(s.printScale).toBe("1:1000");
    expect(s.printPaperSize).toBe("A4");
    expect(s.printOrientation).toBe("portrait");
  });

  it("reset() returns printScale back to undefined", () => {
    useHydraulicStore.getState().updateSettings({ printScale: "1:1000" });
    expect(useHydraulicStore.getState().settings.printScale).toBe("1:1000");
    useHydraulicStore.getState().reset();
    expect(useHydraulicStore.getState().settings.printScale).toBeUndefined();
  });
});
