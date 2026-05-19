/**
 * Phase 12.1 — Outline-first entity workflow tests.
 *
 * Pure-helper coverage: centroid math, default-label conventions,
 * tag-as parameter shape, prefix counting for sequential numbering.
 */
import { describe, it, expect } from "vitest";
import {
  buildingCentroid,
  defaultLabelForKind,
  countExistingLabelPrefix,
  buildTagAsParams,
  TAG_AS_KIND_OPTIONS,
} from "../outlineTag";
import type { SchemeBuilding, SchemeNode } from "../../hydraulicTypes";

function makeBuilding(over: Partial<SchemeBuilding> & { id: string }): SchemeBuilding {
  return {
    polygon: [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ],
    ...over,
  };
}

function makeNode(id: string, kind: string, label: string): SchemeNode {
  return { id, kind, label, x: 0, y: 0 };
}

/* ─── Centroid math ─────────────────────────────────────────────── */

describe("buildingCentroid", () => {
  it("returns centroid of square at (50, 50)", () => {
    const c = buildingCentroid(makeBuilding({ id: "b1" }));
    expect(c.x).toBeCloseTo(50, 1);
    expect(c.y).toBeCloseTo(50, 1);
  });

  it("handles rectangular building", () => {
    const c = buildingCentroid(makeBuilding({
      id: "b1",
      polygon: [
        { x: 100, y: 50 },
        { x: 300, y: 50 },
        { x: 300, y: 150 },
        { x: 100, y: 150 },
      ],
    }));
    expect(c.x).toBeCloseTo(200, 1);
    expect(c.y).toBeCloseTo(100, 1);
  });

  it("handles triangle (3 vertices)", () => {
    const c = buildingCentroid(makeBuilding({
      id: "b1",
      polygon: [
        { x: 0, y: 0 },
        { x: 60, y: 0 },
        { x: 30, y: 90 },
      ],
    }));
    // Triangle centroid = arithmetic mean
    expect(c.x).toBeCloseTo(30, 1);
    expect(c.y).toBeCloseTo(30, 1);
  });

  it("handles L-shaped polygon (6 vertices)", () => {
    const c = buildingCentroid(makeBuilding({
      id: "b1",
      polygon: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 50 },
        { x: 50, y: 50 },
        { x: 50, y: 100 },
        { x: 0, y: 100 },
      ],
    }));
    // Centroid biased toward larger area (bottom rectangle)
    expect(c.x).toBeGreaterThan(0);
    expect(c.x).toBeLessThan(100);
    expect(c.y).toBeGreaterThan(0);
    expect(c.y).toBeLessThan(100);
  });

  it("handles degenerate single-point polygon", () => {
    const c = buildingCentroid(makeBuilding({
      id: "b1",
      polygon: [{ x: 42, y: 17 }],
    }));
    expect(c.x).toBe(42);
    expect(c.y).toBe(17);
  });

  it("handles empty polygon (defensive)", () => {
    const c = buildingCentroid(makeBuilding({
      id: "b1",
      polygon: [],
    }));
    expect(c).toEqual({ x: 0, y: 0 });
  });
});

/* ─── Default labels per kind (Mongolian convention) ──────────── */

describe("defaultLabelForKind — Mongolian engineering convention", () => {
  it("source_substation → УДДТ-N", () => {
    expect(defaultLabelForKind("source_substation", 1)).toBe("УДДТ-1");
    expect(defaultLabelForKind("source_substation", 8)).toBe("УДДТ-8");
  });

  it("source_boiler → Зуух-N", () => {
    expect(defaultLabelForKind("source_boiler", 2)).toBe("Зуух-2");
  });

  it("source_factory → ЭҮ-N (Phase 13.25 rename: ТЭЦ → Эх үүсвэр)", () => {
    expect(defaultLabelForKind("source_factory", 1)).toBe("ЭҮ-1");
  });

  it("source_tec → ЭҮ-N (Phase 13.25 default ТЭЦ label switched)", () => {
    expect(defaultLabelForKind("source_tec", 2)).toBe("ЭҮ-2");
  });

  it("consumer_apartment → АОС-N", () => {
    expect(defaultLabelForKind("consumer_apartment", 5)).toBe("АОС-5");
    expect(defaultLabelForKind("consumer_apartment", 31)).toBe("АОС-31");
  });

  it("consumer_school → АОЭ-N", () => {
    expect(defaultLabelForKind("consumer_school", 1)).toBe("АОЭ-1");
  });

  it("consumer_industrial → АОБ-N", () => {
    expect(defaultLabelForKind("consumer_industrial", 1)).toBe("АОБ-1");
  });

  it("well_supply → ҮХТ-N (per GK-23/02)", () => {
    expect(defaultLabelForKind("well_supply", 1)).toBe("ҮХТ-1");
    expect(defaultLabelForKind("well_supply", 15)).toBe("ҮХТ-15");
  });

  it("well_drain → ҮДТ-N", () => {
    expect(defaultLabelForKind("well_drain", 1)).toBe("ҮДТ-1");
  });

  it("chamber → К-N", () => {
    expect(defaultLabelForKind("chamber", 4)).toBe("К-4");
  });

  it("compensator_u → ЭӨ-N", () => {
    expect(defaultLabelForKind("compensator_u", 7)).toBe("ЭӨ-7");
  });

  it("compensator_bellow → ЭӨ-N", () => {
    expect(defaultLabelForKind("compensator_bellow", 3)).toBe("ЭӨ-3");
  });

  it("pump_circ → Н-N", () => {
    expect(defaultLabelForKind("pump_circ", 1)).toBe("Н-1");
  });

  it("unknown kind falls back to shortLabel or '?-N'", () => {
    const lbl = defaultLabelForKind("__totally_unknown_kind__", 1);
    expect(lbl).toMatch(/-1$/);
  });
});

/* ─── Sequential numbering via prefix count ───────────────────── */

describe("countExistingLabelPrefix", () => {
  it("returns 0 for empty nodes", () => {
    expect(countExistingLabelPrefix([], "consumer_apartment")).toBe(0);
  });

  it("counts АОС-* labels for consumer_apartment kind", () => {
    const nodes = [
      makeNode("n1", "consumer_apartment", "АОС-1"),
      makeNode("n2", "consumer_apartment", "АОС-2"),
      makeNode("n3", "consumer_apartment", "АОС-7"),
      makeNode("n4", "source_substation", "УДДТ-1"),
    ];
    expect(countExistingLabelPrefix(nodes, "consumer_apartment")).toBe(3);
  });

  it("doesn't cross-count different kinds", () => {
    const nodes = [
      makeNode("n1", "consumer_apartment", "АОС-1"),
      makeNode("n2", "consumer_apartment", "АОС-2"),
    ];
    expect(countExistingLabelPrefix(nodes, "consumer_school")).toBe(0);
  });

  it("counts ҮХТ-* labels", () => {
    const nodes = [
      makeNode("n1", "well_supply", "ҮХТ-1"),
      makeNode("n2", "well_supply", "ҮХТ-2"),
      makeNode("n3", "well_supply", "ҮХТ-15"),
    ];
    expect(countExistingLabelPrefix(nodes, "well_supply")).toBe(3);
  });

  it("ignores labels that match the prefix but lack the dash", () => {
    const nodes = [
      makeNode("n1", "consumer_apartment", "АОС"),         // no dash → skip
      makeNode("n2", "consumer_apartment", "АОСхэвт-99"),   // unrelated prefix
      makeNode("n3", "consumer_apartment", "АОС-12"),       // valid
    ];
    // Only "АОС-12" matches `startsWith("АОС-")`
    expect(countExistingLabelPrefix(nodes, "consumer_apartment")).toBe(1);
  });
});

/* ─── Tag-as parameter builder ────────────────────────────────── */

describe("buildTagAsParams", () => {
  it("creates node at building centroid", () => {
    const building = makeBuilding({ id: "b1" });
    const { node } = buildTagAsParams(building, "consumer_apartment", []);
    expect(node.x).toBeCloseTo(50, 1);
    expect(node.y).toBeCloseTo(50, 1);
  });

  it("assigns kind correctly", () => {
    const { node } = buildTagAsParams(makeBuilding({ id: "b1" }), "well_supply", []);
    expect(node.kind).toBe("well_supply");
  });

  it("assigns label using next number from prefix count", () => {
    const existing = [
      makeNode("n1", "consumer_apartment", "АОС-1"),
      makeNode("n2", "consumer_apartment", "АОС-2"),
    ];
    const { node } = buildTagAsParams(
      makeBuilding({ id: "b1" }),
      "consumer_apartment",
      existing,
    );
    expect(node.label).toBe("АОС-3");
  });

  it("preserves engineer-typed building label when set", () => {
    const building = makeBuilding({ id: "b1", label: "ЭӨ-5 (custom)" });
    const { node, buildingPatch } = buildTagAsParams(building, "compensator_u", []);
    expect(node.label).toBe("ЭӨ-5 (custom)");
    expect(buildingPatch.label).toBe("ЭӨ-5 (custom)");
  });

  it("generates a unique node id", () => {
    const r1 = buildTagAsParams(makeBuilding({ id: "b1" }), "well_supply", []);
    const r2 = buildTagAsParams(makeBuilding({ id: "b2" }), "well_supply", []);
    expect(r1.node.id).not.toBe(r2.node.id);
  });

  it("buildingPatch references the created node", () => {
    const { node, buildingPatch } = buildTagAsParams(
      makeBuilding({ id: "b1" }),
      "well_supply",
      [],
    );
    expect(buildingPatch.taggedAsKind).toBe("well_supply");
    expect(buildingPatch.taggedAsNodeId).toBe(node.id);
  });
});

/* ─── TAG_AS_KIND_OPTIONS registry ─────────────────────────────── */

describe("TAG_AS_KIND_OPTIONS", () => {
  it("covers all major Mongolian entity types", () => {
    const kinds = TAG_AS_KIND_OPTIONS.map((o) => o.kind);
    expect(kinds).toContain("source_substation");
    expect(kinds).toContain("source_boiler");
    expect(kinds).toContain("consumer_apartment");
    expect(kinds).toContain("consumer_school");
    expect(kinds).toContain("consumer_industrial");
    expect(kinds).toContain("well_supply");
    expect(kinds).toContain("chamber");
    expect(kinds).toContain("compensator_u");
  });

  it("labels include Mongolian-friendly convention markers (УДДТ / АОС / ҮХТ etc.)", () => {
    const labels = TAG_AS_KIND_OPTIONS.map((o) => o.label).join("\n");
    expect(labels).toMatch(/УДДТ/);
    expect(labels).toMatch(/АОС/);
    expect(labels).toMatch(/ҮХТ/);
    expect(labels).toMatch(/ЭӨ/);
  });

  it("groups entries by category", () => {
    const categories = new Set(TAG_AS_KIND_OPTIONS.map((o) => o.category));
    expect(categories.has("source")).toBe(true);
    expect(categories.has("consumer")).toBe(true);
    expect(categories.has("chamber")).toBe(true);
    expect(categories.has("fitting")).toBe(true);
  });
});
