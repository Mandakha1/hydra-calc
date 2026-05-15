/**
 * Phase 12.8 — Node numbering helper tests.
 */
import { describe, it, expect } from "vitest";
import { assignNodeNumbers, nodeNumberBadge } from "../nodeNumbering";
import type { SchemeNode } from "../../hydraulicTypes";

function n(id: string, kind: string, label: string = id): SchemeNode {
  return { id, kind, label, x: 0, y: 0 };
}

describe("assignNodeNumbers — Mongolian category order", () => {
  it("sources first, then junctions, then consumers, then chambers", () => {
    const nodes = [
      n("c1", "consumer_apartment"),
      n("j1", "junction"),
      n("s1", "source_substation"),
      n("k1", "chamber"),
    ];
    const map = assignNodeNumbers(nodes);
    expect(map.get("s1")).toBe(1);
    expect(map.get("j1")).toBe(2);
    expect(map.get("c1")).toBe(3);
    expect(map.get("k1")).toBe(4);
  });

  it("nodes within the same category retain insertion order", () => {
    const nodes = [
      n("c2", "consumer_apartment"),
      n("c1", "consumer_apartment"),
      n("c3", "consumer_apartment"),
    ];
    const map = assignNodeNumbers(nodes);
    expect(map.get("c2")).toBe(1);
    expect(map.get("c1")).toBe(2);
    expect(map.get("c3")).toBe(3);
  });

  it("source_boiler and source_substation share category 'source'", () => {
    const nodes = [
      n("b1", "source_boiler"),
      n("s1", "source_substation"),
      n("j1", "junction"),
    ];
    const map = assignNodeNumbers(nodes);
    expect(map.get("b1")).toBe(1);
    expect(map.get("s1")).toBe(2);
    expect(map.get("j1")).toBe(3);
  });

  it("returns empty map for empty input", () => {
    expect(assignNodeNumbers([]).size).toBe(0);
  });

  it("unknown node kinds end up at the tail", () => {
    const nodes = [
      n("u", "totally_unknown_kind"),
      n("s1", "source_substation"),
    ];
    const map = assignNodeNumbers(nodes);
    expect(map.get("s1")).toBe(1);
    expect(map.get("u")).toBe(2);
  });
});

describe("nodeNumberBadge", () => {
  it("pads single-digit with leading zero", () => {
    expect(nodeNumberBadge(1)).toBe("01");
    expect(nodeNumberBadge(9)).toBe("09");
  });

  it("no padding for two-digit", () => {
    expect(nodeNumberBadge(10)).toBe("10");
    expect(nodeNumberBadge(42)).toBe("42");
  });

  it("undefined returns empty string", () => {
    expect(nodeNumberBadge(undefined)).toBe("");
  });
});
