/**
 * Phase 12.2 — dimension formatting helper tests.
 *
 * Pure-helper coverage: tiered precision, cardinal direction wedge
 * boundaries, HUD edge-aware placement.
 */
import { describe, it, expect } from "vitest";
import {
  formatLength,
  formatAngle,
  cardinalDirection,
  CARDINAL_FULL_LABEL,
  formatLiveDimensionLine,
  hudPlacement,
  type CardinalCode,
} from "../dimensionFormat";

/* ─── formatLength tiered precision ────────────────────────────── */

describe("formatLength — tiered precision per Phase 12 decision 12", () => {
  it("below 1m: 2 decimal places", () => {
    expect(formatLength(0.85)).toBe("0.85 м");
    expect(formatLength(0.01)).toBe("0.01 м");
    expect(formatLength(0.999)).toBe("1.00 м");
  });

  it("1-100m: 2 decimal places (0.01m / 1cm precision)", () => {
    expect(formatLength(12.34)).toBe("12.34 м");
    expect(formatLength(50.5)).toBe("50.50 м");
    expect(formatLength(99.99)).toBe("99.99 м");
  });

  it("100m+: integer (drop decimals)", () => {
    expect(formatLength(100)).toBe("100 м");
    expect(formatLength(234.56)).toBe("235 м");
    expect(formatLength(1426.2)).toBe("1426 м");
  });

  it("zero formats cleanly", () => {
    expect(formatLength(0)).toBe("0.00 м");
  });

  it("negative absolute-value compared (engineer-facing magnitude)", () => {
    expect(formatLength(-12.5)).toBe("-12.50 м");
    // Defensive: |abs| ≥ 100 still drops decimals
    expect(formatLength(-150)).toBe("-150 м");
  });
});

/* ─── formatAngle 0.1° precision + normalization ──────────────── */

describe("formatAngle", () => {
  it("0.1° precision", () => {
    expect(formatAngle(37.5)).toBe("37.5°");
    expect(formatAngle(-90)).toBe("-90.0°");
    expect(formatAngle(0)).toBe("0.0°");
  });

  it("normalizes >180 to negative half", () => {
    expect(formatAngle(270)).toBe("-90.0°");
    expect(formatAngle(360)).toBe("0.0°");
  });

  it("normalizes <-180 to positive half", () => {
    expect(formatAngle(-270)).toBe("90.0°");
  });

  it("preserves 180 (boundary stays positive)", () => {
    expect(formatAngle(180)).toBe("180.0°");
  });
});

/* ─── cardinalDirection 8-wedge boundary tests ────────────────── */

describe("cardinalDirection — Mongolian 8-point compass", () => {
  // In SVG (Y-down): 0 rad = East, π/2 = South, -π/2 = North
  // Wedge centres: З=0, УЗ=π/4, У=π/2, УБ=3π/4, Б=π, ХБ=5π/4=-3π/4,
  //                Х=-π/2, ХЗ=-π/4

  const TEST_CASES: Array<{ angleDeg: number; expected: CardinalCode; label: string }> = [
    { angleDeg: 0,    expected: "З",  label: "0° → East (Зүүн)" },
    { angleDeg: 45,   expected: "УЗ", label: "45° → SE" },
    { angleDeg: 90,   expected: "У",  label: "90° → South (Урд, because Y-down)" },
    { angleDeg: 135,  expected: "УБ", label: "135° → SW" },
    { angleDeg: 180,  expected: "Б",  label: "180° → West (Баруун)" },
    { angleDeg: -135, expected: "ХБ", label: "-135° → NW" },
    { angleDeg: -90,  expected: "Х",  label: "-90° → North (Хойд)" },
    { angleDeg: -45,  expected: "ХЗ", label: "-45° → NE" },
  ];

  TEST_CASES.forEach(({ angleDeg, expected, label }) => {
    it(label, () => {
      const rad = (angleDeg * Math.PI) / 180;
      expect(cardinalDirection(rad)).toBe(expected);
    });
  });

  it("boundary at 22.5° rounds to УЗ (SE wedge)", () => {
    expect(cardinalDirection((22.5 * Math.PI) / 180)).toBe("УЗ");
  });

  it("just before 22.5° still З (East wedge)", () => {
    expect(cardinalDirection((22.4 * Math.PI) / 180)).toBe("З");
  });

  it("handles wraparound (360° = 0° → З)", () => {
    expect(cardinalDirection((360 * Math.PI) / 180)).toBe("З");
  });

  it("handles negative wraparound", () => {
    expect(cardinalDirection((-360 * Math.PI) / 180)).toBe("З");
  });
});

/* ─── CARDINAL_FULL_LABEL coverage ─────────────────────────────── */

describe("CARDINAL_FULL_LABEL", () => {
  it("provides Mongolian full names for all 8 codes", () => {
    expect(CARDINAL_FULL_LABEL.Х).toBe("Хойд");
    expect(CARDINAL_FULL_LABEL.ХЗ).toBe("Хойд-Зүүн");
    expect(CARDINAL_FULL_LABEL.З).toBe("Зүүн");
    expect(CARDINAL_FULL_LABEL.УЗ).toBe("Урд-Зүүн");
    expect(CARDINAL_FULL_LABEL.У).toBe("Урд");
    expect(CARDINAL_FULL_LABEL.УБ).toBe("Урд-Баруун");
    expect(CARDINAL_FULL_LABEL.Б).toBe("Баруун");
    expect(CARDINAL_FULL_LABEL.ХБ).toBe("Хойд-Баруун");
  });
});

/* ─── formatLiveDimensionLine combined output ─────────────────── */

describe("formatLiveDimensionLine", () => {
  it("combines length + angle + cardinal into one line", () => {
    const out = formatLiveDimensionLine(12.34, 0);
    expect(out).toBe("12.34 м · 0.0° З");
  });

  it("integer length above 100m", () => {
    const out = formatLiveDimensionLine(150, Math.PI / 2);
    expect(out).toBe("150 м · 90.0° У");
  });
});

/* ─── hudPlacement edge-aware positioning ──────────────────────── */

describe("hudPlacement — edge-aware HUD positioning", () => {
  const VIEWPORT = { width: 1280, height: 800 };
  const HUD = { width: 180, height: 80 };

  it("default down-right offset (cursor in viewport centre)", () => {
    const p = hudPlacement({ x: 600, y: 400 }, VIEWPORT, HUD);
    expect(p.left).toBe(612);
    expect(p.top).toBe(412);
  });

  it("flips to up-left when within 100px of right edge", () => {
    const p = hudPlacement({ x: 1200, y: 400 }, VIEWPORT, HUD);
    expect(p.left).toBeLessThan(1200);
  });

  it("flips to up-left when within 100px of bottom edge", () => {
    const p = hudPlacement({ x: 600, y: 750 }, VIEWPORT, HUD);
    expect(p.top).toBeLessThan(750);
  });

  it("clamps to viewport (defensive for tiny viewports)", () => {
    const tiny = { width: 200, height: 150 };
    const p = hudPlacement({ x: 100, y: 75 }, tiny, HUD);
    // Should never exceed viewport
    expect(p.left + HUD.width).toBeLessThanOrEqual(tiny.width);
    expect(p.top + HUD.height).toBeLessThanOrEqual(tiny.height);
    expect(p.left).toBeGreaterThanOrEqual(0);
    expect(p.top).toBeGreaterThanOrEqual(0);
  });

  it("cursor near top-left (0, 0) places HUD in viewport", () => {
    const p = hudPlacement({ x: 0, y: 0 }, VIEWPORT, HUD);
    expect(p.left).toBeGreaterThanOrEqual(0);
    expect(p.top).toBeGreaterThanOrEqual(0);
  });
});
