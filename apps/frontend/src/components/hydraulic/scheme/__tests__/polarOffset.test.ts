/**
 * Phase 13.5 — Polar-offset math tests (AutoCAD convention).
 */
import { describe, it, expect } from "vitest";
import {
  polarOffsetPoint,
  polarFromTwoPoints,
  parseDimensionInput,
} from "../polarOffset";

const PX = 20; // 1 m = 20 px (Hydra Calc PX_PER_METER default)

describe("polarOffsetPoint — REAL-SCALE on map (Phase 13.5b)", () => {
  it("uses MAP px/м when map is shown — 5m at 0° with mapPxPerMeter=5.6 → +28 px", () => {
    // OSM zoom 18 at УБ latitude ≈ 5.6 px/м (typical residential view).
    const p = polarOffsetPoint({ x: 0, y: 0 }, 5, 0, 5.6);
    expect(p.x).toBeCloseTo(28, 1);
    expect(p.y).toBeCloseTo(0, 1);
  });

  it("uses MAP px/м at zoom 14 ≈ 0.35 px/м → 5m = 1.75 px (zoomed out view)", () => {
    const p = polarOffsetPoint({ x: 100, y: 100 }, 5, 0, 0.35);
    expect(p.x).toBeCloseTo(101.75, 1);
  });

  it("schematic-mode fallback PX_PER_METER (20 px/м) still works", () => {
    // 5m at 0° with schematic 20 px/м → +100 px (legacy behaviour).
    const p = polarOffsetPoint({ x: 0, y: 0 }, 5, 0, 20);
    expect(p.x).toBeCloseTo(100, 1);
  });
});

describe("polarOffsetPoint — AutoCAD convention (0° east, CCW)", () => {
  it("5 m at 0° → +100 px east, y unchanged", () => {
    const p = polarOffsetPoint({ x: 100, y: 100 }, 5, 0, PX);
    expect(p.x).toBeCloseTo(200, 1);
    expect(p.y).toBeCloseTo(100, 1);
  });

  it("5 m at 90° (north / up) → x unchanged, -100 px (SVG y-down)", () => {
    const p = polarOffsetPoint({ x: 100, y: 100 }, 5, 90, PX);
    expect(p.x).toBeCloseTo(100, 1);
    expect(p.y).toBeCloseTo(0, 1);
  });

  it("5 m at 180° (west) → -100 px x, y unchanged", () => {
    const p = polarOffsetPoint({ x: 100, y: 100 }, 5, 180, PX);
    expect(p.x).toBeCloseTo(0, 1);
    expect(p.y).toBeCloseTo(100, 1);
  });

  it("5 m at 270° (south / down) → x unchanged, +100 px", () => {
    const p = polarOffsetPoint({ x: 100, y: 100 }, 5, 270, PX);
    expect(p.x).toBeCloseTo(100, 1);
    expect(p.y).toBeCloseTo(200, 1);
  });

  it("5 m at 45° (NE) → +70.7 x, -70.7 y", () => {
    const p = polarOffsetPoint({ x: 100, y: 100 }, 5, 45, PX);
    expect(p.x).toBeCloseTo(170.71, 1);
    expect(p.y).toBeCloseTo(29.29, 1);
  });

  it("negative angle (wrap) — -45° = 315° (SE) → +70.7 x, +70.7 y", () => {
    const p = polarOffsetPoint({ x: 100, y: 100 }, 5, -45, PX);
    expect(p.x).toBeCloseTo(170.71, 1);
    expect(p.y).toBeCloseTo(170.71, 1);
  });

  it("rounds to 0.1 px precision", () => {
    const p = polarOffsetPoint({ x: 0, y: 0 }, 1.234567, 37.89, PX);
    expect(Number.isFinite(p.x)).toBe(true);
    expect(Number.isFinite(p.y)).toBe(true);
    expect(p.x * 10).toBeCloseTo(Math.round(p.x * 10), 6);
    expect(p.y * 10).toBeCloseTo(Math.round(p.y * 10), 6);
  });
});

describe("polarFromTwoPoints — inverse for HUD pre-fill", () => {
  it("east-pointing segment → 0°", () => {
    const r = polarFromTwoPoints({ x: 100, y: 100 }, { x: 200, y: 100 }, PX);
    expect(r.length_m).toBe(5);
    expect(r.angle_deg).toBe(0);
  });

  it("north-pointing segment → 90°", () => {
    const r = polarFromTwoPoints({ x: 100, y: 100 }, { x: 100, y: 0 }, PX);
    expect(r.length_m).toBe(5);
    expect(r.angle_deg).toBe(90);
  });

  it("west → 180°", () => {
    const r = polarFromTwoPoints({ x: 100, y: 100 }, { x: 0, y: 100 }, PX);
    expect(r.angle_deg).toBe(180);
  });

  it("south → 270°", () => {
    const r = polarFromTwoPoints({ x: 100, y: 100 }, { x: 100, y: 200 }, PX);
    expect(r.angle_deg).toBe(270);
  });

  it("round-trip: polarFromTwoPoints(polarOffsetPoint(...)) ≈ original input", () => {
    const original = { length_m: 3.5, angle_deg: 67 };
    const dest = polarOffsetPoint({ x: 0, y: 0 }, original.length_m, original.angle_deg, PX);
    const back = polarFromTwoPoints({ x: 0, y: 0 }, dest, PX);
    expect(back.length_m).toBeCloseTo(original.length_m, 1);
    expect(back.angle_deg).toBeCloseTo(original.angle_deg, 0);
  });
});

describe("parseDimensionInput — partial / invalid handling", () => {
  it("valid: '5' / '45' → { length_m: 5, angle_deg: 45 }", () => {
    expect(parseDimensionInput("5", "45")).toEqual({ length_m: 5, angle_deg: 45 });
  });

  it("decimal length: '1.5' / '0' → 1.5 m at 0°", () => {
    expect(parseDimensionInput("1.5", "0")).toEqual({ length_m: 1.5, angle_deg: 0 });
  });

  it("rejects empty / partial input", () => {
    expect(parseDimensionInput("", "45")).toBeNull();
    expect(parseDimensionInput("5", "")).toBeNull();
    expect(parseDimensionInput("1.", "")).toBeNull();
    expect(parseDimensionInput("-3", "45")).toBeNull();
    expect(parseDimensionInput("0", "0")).toBeNull(); // zero length
  });

  it("wraps angle into [0, 360)", () => {
    expect(parseDimensionInput("5", "720")?.angle_deg).toBe(0);
    expect(parseDimensionInput("5", "-45")?.angle_deg).toBe(315);
    expect(parseDimensionInput("5", "405")?.angle_deg).toBe(45);
  });

  it("rejects NaN angle", () => {
    expect(parseDimensionInput("5", "abc")).toBeNull();
  });
});
