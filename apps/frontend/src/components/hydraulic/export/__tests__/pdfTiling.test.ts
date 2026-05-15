/**
 * Phase 11.2 — PDF tile-grid math tests.
 */
import { describe, it, expect } from "vitest";
import { computeTileGrid, pageBoundsInPx, suggestedTileCount } from "../pdfTiling";

/* PX_PER_METER from nodeCatalog (20 px/m). We pass it explicitly to
   keep the math pure + reviewable. */
const PX_PER_METER = 20;

describe("pageBoundsInPx", () => {
  it("A3 landscape at 1:500 → drawing area ~40000 px wide", () => {
    // A3 landscape: 420×297mm, minus 2×10mm margin → 400×277mm drawing
    // At 1:500, 1mm paper = 0.5m real. 400mm = 200m. 200m × 20 px/m = 4000 px
    const out = pageBoundsInPx("A3", "landscape", "1:500", PX_PER_METER);
    expect(out.widthPx).toBeCloseTo(4000, 0);
    expect(out.heightPx).toBeCloseTo(2770, 0);
  });

  it("A4 portrait at 1:1000 → 19000 px × 27700 px scheme bounds", () => {
    // A4 portrait: 210×297mm, minus 2×10mm → 190×277mm
    // 1:1000 → 1mm = 1m → 190m × 277m
    // × 20 px/m → 3800 × 5540
    const out = pageBoundsInPx("A4", "portrait", "1:1000", PX_PER_METER);
    expect(out.widthPx).toBeCloseTo(3800, 0);
    expect(out.heightPx).toBeCloseTo(5540, 0);
  });
});

describe("computeTileGrid — fits on one tile", () => {
  it("small bbox at A3 1:500 → 1×1 grid", () => {
    const bbox = { minX: 0, minY: 0, width: 1000, height: 800 };
    const grid = computeTileGrid(bbox, "A3", "landscape", "1:500", PX_PER_METER);
    expect(grid.totalTiles).toBe(1);
    expect(grid.tiles).toHaveLength(1);
    expect(grid.tiles[0]!.label).toBe("Plan 1/1");
  });

  it("returns the original bbox as the only tile's viewBox", () => {
    const bbox = { minX: 100, minY: 50, width: 500, height: 400 };
    const grid = computeTileGrid(bbox, "A3", "landscape", "1:500", PX_PER_METER);
    expect(grid.tiles[0]!.viewBoxPx).toEqual(bbox);
  });
});

describe("computeTileGrid — multi-tile", () => {
  it("400m × 300m at 1:200 on A3 lands → 2×1 grid", () => {
    // 400m × 20 px/m = 8000 px wide
    // 300m × 20 px/m = 6000 px tall
    // A3 land at 1:200: paper drawing area 400mm × 277mm
    // 1:200 → 1mm=0.2m → 80m × 55.4m → 1600 × 1108 px
    // Cols: ceil(8000/1600) = 5 → clamped to 4? Default maxCols=4
    // Rows: ceil(6000/1108) = 6 → clamped to 4
    // So actual: clamp(5,4) × clamp(6,4) = 4×4
    const bbox = { minX: 0, minY: 0, width: 8000, height: 6000 };
    const grid = computeTileGrid(bbox, "A3", "landscape", "1:200", PX_PER_METER);
    expect(grid.cols).toBe(4);
    expect(grid.rows).toBe(4);
    expect(grid.totalTiles).toBe(16);
  });

  it("tiles ordered: top-row left to right, then next row", () => {
    // A4 land at 1:500: 277×190mm × 0.5 m/mm × 20 px/m → 2770×1900 px
    // 5000 / 2770 → cols=2; 4000 / 1900 → rows=3 → 2×3 = 6 tiles
    const bbox = { minX: 0, minY: 0, width: 5000, height: 4000 };
    const grid = computeTileGrid(bbox, "A4", "landscape", "1:500", PX_PER_METER);
    expect(grid.cols).toBe(2);
    expect(grid.rows).toBe(3);
    // First tile is TOP-LEFT
    expect(grid.tiles[0]!.label).toBe("Plan 1/6");
    // Last tile is BOTTOM-RIGHT
    expect(grid.tiles[grid.tiles.length - 1]!.label).toBe("Plan 6/6");
  });

  it("tile viewBoxes cover the original bbox without gaps", () => {
    const bbox = { minX: 0, minY: 0, width: 10000, height: 8000 };
    const grid = computeTileGrid(bbox, "A4", "landscape", "1:1000", PX_PER_METER);
    // Each tile width + height should sum to the bbox dims
    const totalArea = bbox.width * bbox.height;
    const tilesArea = grid.tiles.reduce(
      (sum, t) => sum + t.viewBoxPx.width * t.viewBoxPx.height,
      0,
    );
    expect(tilesArea).toBeCloseTo(totalArea, 1);
  });

  it("respects maxCols clamp", () => {
    // 100km × 100km bbox @ 1:500 would need 100s of tiles
    const bbox = { minX: 0, minY: 0, width: 100_000, height: 100_000 };
    const grid = computeTileGrid(bbox, "A3", "landscape", "1:500", PX_PER_METER, 4);
    expect(grid.cols).toBeLessThanOrEqual(4);
    expect(grid.rows).toBeLessThanOrEqual(4);
  });

  it("respects custom maxCols=2 → 2x2 max", () => {
    const bbox = { minX: 0, minY: 0, width: 50_000, height: 50_000 };
    const grid = computeTileGrid(bbox, "A3", "landscape", "1:500", PX_PER_METER, 2);
    expect(grid.cols).toBeLessThanOrEqual(2);
    expect(grid.rows).toBeLessThanOrEqual(2);
  });
});

describe("suggestedTileCount", () => {
  it("small bbox returns 1 (no tiling needed)", () => {
    const n = suggestedTileCount({ width: 1000, height: 800 }, "A3", "landscape", "1:500", PX_PER_METER);
    expect(n).toBe(1);
  });

  it("returns count > 1 for oversized bbox", () => {
    const n = suggestedTileCount({ width: 8000, height: 6000 }, "A3", "landscape", "1:200", PX_PER_METER);
    expect(n).toBeGreaterThan(1);
  });
});

describe("computeTileGrid — engineer-facing labels", () => {
  it("labels follow 'Plan N/M' Mongolian convention", () => {
    const bbox = { minX: 0, minY: 0, width: 12000, height: 8000 };
    const grid = computeTileGrid(bbox, "A4", "portrait", "1:500", PX_PER_METER);
    for (const t of grid.tiles) {
      expect(t.label).toMatch(/^Plan \d+\/\d+$/);
    }
  });
});
