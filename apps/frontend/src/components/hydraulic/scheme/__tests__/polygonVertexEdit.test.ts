/**
 * Phase 13.3 — Polygon vertex editing helper tests.
 */
import { describe, it, expect } from "vitest";
import {
  setVertex,
  insertVertex,
  removeVertex,
  polygonBboxMetres,
} from "../polygonVertexEdit";

const SQUARE = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 100, y: 100 },
  { x: 0, y: 100 },
];

describe("setVertex", () => {
  it("replaces the vertex at the given index", () => {
    const out = setVertex(SQUARE, 1, { x: 200, y: -20 });
    expect(out[0]).toEqual({ x: 0, y: 0 });
    expect(out[1]).toEqual({ x: 200, y: -20 });
    expect(out[2]).toEqual({ x: 100, y: 100 });
  });

  it("rounds new vertex coords to 0.1 m precision", () => {
    const out = setVertex(SQUARE, 0, { x: 12.345, y: 7.678 });
    expect(out[0]).toEqual({ x: 12.3, y: 7.7 });
  });

  it("preserves lat / lon when next vertex carries them", () => {
    const out = setVertex(SQUARE, 2, { x: 110, y: 110, lat: 47.91, lon: 106.93 });
    expect(out[2]!.lat).toBe(47.91);
    expect(out[2]!.lon).toBe(106.93);
  });

  it("out-of-range index returns a fresh polygon unchanged", () => {
    const out = setVertex(SQUARE, 99, { x: 1, y: 1 });
    expect(out).toEqual(SQUARE);
    expect(out).not.toBe(SQUARE); // fresh object
  });

  it("negative index returns a fresh polygon unchanged", () => {
    const out = setVertex(SQUARE, -1, { x: 1, y: 1 });
    expect(out).toEqual(SQUARE);
  });
});

describe("insertVertex", () => {
  it("inserts between index and index+1", () => {
    const out = insertVertex(SQUARE, 0, { x: 50, y: 0 });
    expect(out).toHaveLength(5);
    expect(out[1]).toEqual({ x: 50, y: 0 });
    expect(out[2]).toEqual({ x: 100, y: 0 });
  });

  it("wraps the after-index modulo polygon length (closing edge)", () => {
    // afterIndex=3 (last vertex) → inserts at index 4 (before wrap-back to 0)
    const out = insertVertex(SQUARE, 3, { x: -10, y: 50 });
    expect(out).toHaveLength(5);
    expect(out[4]).toEqual({ x: -10, y: 50 });
  });

  it("rounds inserted vertex to 0.1 m precision", () => {
    const out = insertVertex(SQUARE, 0, { x: 12.789, y: 3.421 });
    expect(out[1]).toEqual({ x: 12.8, y: 3.4 });
  });

  it("preserves lat / lon on the inserted vertex", () => {
    const out = insertVertex(SQUARE, 0, { x: 50, y: 0, lat: 47.91, lon: 106.92 });
    expect(out[1]!.lat).toBe(47.91);
    expect(out[1]!.lon).toBe(106.92);
  });
});

describe("removeVertex", () => {
  it("removes the vertex at the given index", () => {
    const pent = [...SQUARE, { x: 50, y: -50 }];
    const out = removeVertex(pent, 4);
    expect(out).toHaveLength(4);
    expect(out).toEqual(SQUARE);
  });

  it("refuses to drop below 3 vertices (triangle floor)", () => {
    const tri = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 50, y: 100 },
    ];
    const out = removeVertex(tri, 0);
    expect(out).toEqual(tri);
    expect(out).not.toBe(tri); // returns fresh polygon (doesn't crash)
  });

  it("out-of-range index returns a fresh polygon unchanged", () => {
    const pent = [...SQUARE, { x: 50, y: -50 }];
    const out = removeVertex(pent, 99);
    expect(out).toEqual(pent);
  });
});

describe("polygonBboxMetres", () => {
  it("computes width / height from min/max with px-to-m conversion", () => {
    // 100 px × 100 px polygon, 20 px/m → 5 m × 5 m
    const dims = polygonBboxMetres(SQUARE, 20);
    expect(dims).toEqual({ width_m: 5, height_m: 5 });
  });

  it("rounds to 0.1 m precision", () => {
    // 17 px × 33 px / 20 px/m → 0.85 m × 1.65 m → rounded to 0.9 × 1.7
    const dims = polygonBboxMetres(
      [
        { x: 0, y: 0 },
        { x: 17, y: 0 },
        { x: 17, y: 33 },
        { x: 0, y: 33 },
      ],
      20,
    );
    expect(dims).toEqual({ width_m: 0.9, height_m: 1.7 });
  });

  it("returns zero for empty polygon", () => {
    expect(polygonBboxMetres([], 20)).toEqual({ width_m: 0, height_m: 0 });
  });

  it("returns zero when pxPerMeter is invalid", () => {
    expect(polygonBboxMetres(SQUARE, 0)).toEqual({ width_m: 0, height_m: 0 });
    expect(polygonBboxMetres(SQUARE, -1)).toEqual({ width_m: 0, height_m: 0 });
  });

  it("supports L-shape footprints", () => {
    const lShape = [
      { x: 0, y: 0 },
      { x: 60, y: 0 },
      { x: 60, y: 40 },
      { x: 30, y: 40 },
      { x: 30, y: 100 },
      { x: 0, y: 100 },
    ];
    const dims = polygonBboxMetres(lShape, 20);
    // bbox 60 × 100 px → 3.0 × 5.0 m
    expect(dims).toEqual({ width_m: 3, height_m: 5 });
  });
});
