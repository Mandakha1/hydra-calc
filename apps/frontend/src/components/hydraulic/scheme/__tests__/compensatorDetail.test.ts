/**
 * Phase 8.4 — pure helper tests for compensator detail.
 */
import { describe, it, expect } from "vitest";
import {
  buildCompensatorDetail,
  compensatorVariantOf,
  DEFAULT_COMPENSATOR_DIMS,
  isCompensatorKind,
  pickCompensator,
  variantLabel,
  type CompensatorDetail,
} from "../compensatorDetail";
import type { SchemeNode } from "../../hydraulicTypes";

function n(id: string, kind: string, extras: Partial<SchemeNode> = {}): SchemeNode {
  return { id, kind, label: id, x: 0, y: 0, ...extras };
}

describe("compensatorVariantOf + isCompensatorKind", () => {
  it("detects Ω/U-bend, sильfон, axial, and other compensator kinds", () => {
    expect(compensatorVariantOf("compensator_u")).toBe("u");
    expect(compensatorVariantOf("compensator_bellow")).toBe("bellow");
    expect(compensatorVariantOf("compensator_axial")).toBe("axial");
    expect(isCompensatorKind("compensator_u")).toBe(true);
    expect(isCompensatorKind("compensator_bellow")).toBe(true);
  });

  it("returns null/false for non-compensator kinds", () => {
    expect(compensatorVariantOf("source_substation")).toBeNull();
    expect(compensatorVariantOf("consumer_apartment")).toBeNull();
    expect(isCompensatorKind("chamber")).toBe(false);
  });
});

describe("pickCompensator — selection → fallback → null", () => {
  it("returns the selected compensator when selection is one", () => {
    const nodes = [n("a", "compensator_u"), n("b", "compensator_bellow")];
    expect(pickCompensator(nodes, { kind: "node", id: "b" })?.id).toBe("b");
  });

  it("falls back to the first compensator-kind in the scene", () => {
    const nodes = [n("c", "consumer_apartment"), n("comp", "compensator_u")];
    expect(pickCompensator(nodes, { kind: "node", id: "c" })?.id).toBe("comp");
  });

  it("returns null when no compensator nodes exist", () => {
    expect(pickCompensator([n("c", "consumer_apartment")], null)).toBeNull();
  });
});

describe("buildCompensatorDetail — error + defaults + estimated expansion", () => {
  it("returns error when no compensator in scene", () => {
    const r = buildCompensatorDetail([n("c", "consumer_apartment")], null);
    expect("error" in r).toBe(true);
  });

  it("uses default dims when stored fields are absent", () => {
    const r = buildCompensatorDetail([n("k", "compensator_u")], { kind: "node", id: "k" }) as CompensatorDetail;
    expect(r.bendRadius_mm).toBe(DEFAULT_COMPENSATOR_DIMS.bendRadius_mm);
    expect(r.armHeight_m).toBe(DEFAULT_COMPENSATOR_DIMS.armHeight_m);
    expect(r.span_m).toBe(DEFAULT_COMPENSATOR_DIMS.span_m);
    expect(r.hasExplicitDimensions).toBe(false);
  });

  it("respects explicit dimensions when stored", () => {
    const r = buildCompensatorDetail([
      n("k", "compensator_u", { bendRadius_mm: 800, armHeight_m: 1.8, span_m: 3.5 }),
    ], { kind: "node", id: "k" }) as CompensatorDetail;
    expect(r.bendRadius_mm).toBe(800);
    expect(r.armHeight_m).toBe(1.8);
    expect(r.span_m).toBe(3.5);
    expect(r.hasExplicitDimensions).toBe(true);
  });

  it("computes thermal expansion via α·L·ΔT", () => {
    // α=1.2e-5, ΔT=75, L=3 m → ΔL = 1.2e-5 × 3 × 75 = 0.0027 m = 2.7 mm
    const r = buildCompensatorDetail([
      n("k", "compensator_u", { span_m: 3 }),
    ], { kind: "node", id: "k" }) as CompensatorDetail;
    expect(r.estimatedExpansion_mm).toBeCloseTo(2.7, 2);
  });

  it("variant defaults to 'u' for compensator_u + 'bellow' for compensator_bellow", () => {
    const ru = buildCompensatorDetail([n("u", "compensator_u")], { kind: "node", id: "u" }) as CompensatorDetail;
    const rb = buildCompensatorDetail([n("b", "compensator_bellow")], { kind: "node", id: "b" }) as CompensatorDetail;
    expect(ru.variant).toBe("u");
    expect(rb.variant).toBe("bellow");
  });
});

describe("variantLabel — Mongolian-friendly", () => {
  it("returns engineer-grade labels per variant", () => {
    expect(variantLabel("u")).toMatch(/Ω/);
    expect(variantLabel("bellow")).toMatch(/Сильфон/);
    expect(variantLabel("axial")).toMatch(/Тэнхлэгийн/);
    expect(variantLabel("other")).toMatch(/Бусад/);
  });
});
