/**
 * Phase 13.7 — View-mode projection + extrusion math tests.
 */
import { describe, it, expect } from "vitest";
import {
  projectPoint,
  viewModeLabel,
  viewModeWrapperTransform,
  buildingHeightPx,
  isoWalls,
} from "../viewMode";

describe("projectPoint", () => {
  it("top mode is identity (z ignored)", () => {
    expect(projectPoint({ x: 100, y: 200 }, 50, "top")).toEqual({ x: 100, y: 200 });
    expect(projectPoint({ x: 0, y: 0 }, 999, "top")).toEqual({ x: 0, y: 0 });
  });

  it("bottom mode is identity in scheme-px (wrapper handles the flip)", () => {
    // The wrapper rotates the whole canvas in CSS — projection stays identity.
    expect(projectPoint({ x: 100, y: 200 }, 50, "bottom")).toEqual({ x: 100, y: 200 });
  });

  it("iso mode at origin → (0, 0)", () => {
    expect(projectPoint({ x: 0, y: 0 }, 0, "iso")).toEqual({ x: 0, y: 0 });
  });

  it("iso (100, 0) at z=0 → ≈ (86.6, 50)", () => {
    const p = projectPoint({ x: 100, y: 0 }, 0, "iso");
    expect(p.x).toBeCloseTo(86.6, 1);
    expect(p.y).toBeCloseTo(50, 1);
  });

  it("iso (0, 100) at z=0 → ≈ (-86.6, 50)", () => {
    const p = projectPoint({ x: 0, y: 100 }, 0, "iso");
    expect(p.x).toBeCloseTo(-86.6, 1);
    expect(p.y).toBeCloseTo(50, 1);
  });

  it("iso (100, 100) at z=0 → x = 0 (axes cancel), y = 100", () => {
    const p = projectPoint({ x: 100, y: 100 }, 0, "iso");
    expect(p.x).toBeCloseTo(0, 1);
    expect(p.y).toBeCloseTo(100, 1);
  });

  it("iso z>0 lifts the point UP (smaller y in SVG y-down)", () => {
    const ground = projectPoint({ x: 50, y: 50 }, 0, "iso");
    const top = projectPoint({ x: 50, y: 50 }, 100, "iso");
    expect(top.y).toBeLessThan(ground.y);
    expect(top.y).toBeCloseTo(ground.y - 100, 1);
  });
});

describe("viewModeLabel + viewModeWrapperTransform", () => {
  it("Mongolian labels for the 3 modes", () => {
    expect(viewModeLabel("top")).toMatch(/Дээрээс/);
    expect(viewModeLabel("bottom")).toMatch(/Доороос/);
    expect(viewModeLabel("iso")).toMatch(/Isometric/);
  });

  it("wrapperTransform: top = none, bottom = 180° rotate, iso = perspective + rotateX", () => {
    expect(viewModeWrapperTransform("top")).toBe("none");
    expect(viewModeWrapperTransform("bottom")).toMatch(/rotateZ\(180deg\)/);
    expect(viewModeWrapperTransform("iso")).toMatch(/perspective.*rotateX\(60deg\)/);
  });
});

describe("buildingHeightPx", () => {
  const PX = 20; // 1 m = 20 px

  it("uses explicit buildingHeight_m when set", () => {
    expect(buildingHeightPx({ buildingHeight_m: 15 }, PX)).toBe(300);
  });

  it("falls back to floors × floorHeight_m", () => {
    expect(buildingHeightPx({ floors: 5, floorHeight_m: 3.2 }, PX)).toBeCloseTo(320, 1);
  });

  it("uses 3 m default when floorHeight_m missing", () => {
    expect(buildingHeightPx({ floors: 4 }, PX)).toBeCloseTo(240, 1);
  });

  it("9 m fallback when no fields set (3 floors × 3 m typical)", () => {
    expect(buildingHeightPx({}, PX)).toBe(180);
  });

  it("zero / negative pxPerMeter → 0", () => {
    expect(buildingHeightPx({ floors: 5 }, 0)).toBe(0);
    expect(buildingHeightPx({ floors: 5 }, -1)).toBe(0);
  });

  it("undefined node → 0", () => {
    expect(buildingHeightPx(undefined, PX)).toBe(0);
  });
});

describe("isoWalls", () => {
  const SQUARE_100 = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
    { x: 0, y: 100 },
  ];

  it("4-vertex rectangle → 4 walls", () => {
    expect(isoWalls(SQUARE_100, 60).length).toBe(4);
  });

  it("each wall is a 4-vertex SVG points string", () => {
    const walls = isoWalls(SQUARE_100, 60);
    for (const w of walls) {
      const vertexCount = w.split(" ").length;
      expect(vertexCount).toBe(4);
      // Each "x,y" pair
      for (const pair of w.split(" ")) {
        expect(pair).toMatch(/^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/);
      }
    }
  });

  it("zero height → no walls", () => {
    expect(isoWalls(SQUARE_100, 0)).toEqual([]);
  });

  it("under 3 vertices → no walls", () => {
    expect(isoWalls([{ x: 0, y: 0 }, { x: 100, y: 0 }], 60)).toEqual([]);
  });

  it("triangle → 3 walls", () => {
    const tri = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 50, y: 100 },
    ];
    expect(isoWalls(tri, 60).length).toBe(3);
  });
});
