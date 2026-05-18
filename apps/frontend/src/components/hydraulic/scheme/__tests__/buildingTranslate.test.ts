/**
 * Phase 13.2 — Building polygon translation helper tests.
 */
import { describe, it, expect } from "vitest";
import {
  translatePolygon,
  dragDelta,
  translateNodePatch,
  buildingForTaggedNode,
  isTaggedPair,
} from "../buildingTranslate";
import type { SchemeBuilding } from "../../hydraulicTypes";

const SQUARE = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 100, y: 100 },
  { x: 0, y: 100 },
];

describe("translatePolygon", () => {
  it("translates every vertex by (dx, dy)", () => {
    const out = translatePolygon(SQUARE, { dx: 50, dy: -20 });
    expect(out).toEqual([
      { x: 50, y: -20 },
      { x: 150, y: -20 },
      { x: 150, y: 80 },
      { x: 50, y: 80 },
    ]);
  });

  it("rounds to integer pixel coords", () => {
    const out = translatePolygon(SQUARE, { dx: 12.4, dy: 7.7 });
    expect(out[0]).toEqual({ x: 12, y: 8 });
    expect(out[2]).toEqual({ x: 112, y: 108 });
  });

  it("preserves lat/lon when vertices carry them", () => {
    const withGeo = [
      { x: 0, y: 0, lat: 47.91, lon: 106.92 },
      { x: 100, y: 0, lat: 47.91, lon: 106.93 },
      { x: 100, y: 100 },
    ];
    const out = translatePolygon(withGeo, { dx: 10, dy: 10 });
    expect(out[0]!.lat).toBe(47.91);
    expect(out[0]!.lon).toBe(106.92);
    expect(out[2]!.lat).toBeUndefined();
  });

  it("zero delta is a no-op (modulo rounding)", () => {
    const out = translatePolygon(SQUARE, { dx: 0, dy: 0 });
    expect(out).toEqual(SQUARE);
  });

  it("handles empty polygon gracefully", () => {
    expect(translatePolygon([], { dx: 5, dy: 5 })).toEqual([]);
  });
});

describe("dragDelta", () => {
  it("computes positive delta when cursor moves right + down", () => {
    expect(dragDelta({ x: 100, y: 200 }, { x: 150, y: 230 })).toEqual({ dx: 50, dy: 30 });
  });

  it("computes negative delta when cursor moves left + up", () => {
    expect(dragDelta({ x: 100, y: 200 }, { x: 80, y: 180 })).toEqual({ dx: -20, dy: -20 });
  });

  it("zero delta when cursor hasn't moved", () => {
    expect(dragDelta({ x: 50, y: 50 }, { x: 50, y: 50 })).toEqual({ dx: 0, dy: 0 });
  });
});

describe("translateNodePatch", () => {
  it("returns patch with rounded final coords", () => {
    const patch = translateNodePatch({ x: 50, y: 60 }, { dx: 10.4, dy: -3.7 });
    expect(patch).toEqual({ x: 60, y: 56 });
  });

  it("composes consistently with translatePolygon (same dx/dy)", () => {
    const start = { x: 50, y: 50 };
    const delta = { dx: 25, dy: 25 };
    const nodePatch = translateNodePatch(start, delta);
    const polygon = translatePolygon([{ x: 50, y: 50 }], delta);
    expect(nodePatch.x).toBe(polygon[0]!.x);
    expect(nodePatch.y).toBe(polygon[0]!.y);
  });
});

describe("buildingForTaggedNode", () => {
  it("returns the building whose taggedAsNodeId matches", () => {
    const buildings: SchemeBuilding[] = [
      { id: "b1", polygon: SQUARE, label: "B1", taggedAsNodeId: "n1" },
      { id: "b2", polygon: SQUARE, label: "B2", taggedAsNodeId: "n2" },
      { id: "b3", polygon: SQUARE, label: "B3" }, // untagged
    ];
    expect(buildingForTaggedNode("n1", buildings)?.id).toBe("b1");
    expect(buildingForTaggedNode("n2", buildings)?.id).toBe("b2");
    expect(buildingForTaggedNode("n_other", buildings)).toBeNull();
  });

  it("returns null for empty / undefined buildings list", () => {
    expect(buildingForTaggedNode("n1", [])).toBeNull();
    expect(buildingForTaggedNode("n1", undefined)).toBeNull();
  });
});

describe("isTaggedPair", () => {
  it("true when building.taggedAsNodeId === node.id", () => {
    expect(isTaggedPair({ taggedAsNodeId: "n1" }, { id: "n1" })).toBe(true);
  });

  it("false when ids don't match", () => {
    expect(isTaggedPair({ taggedAsNodeId: "n1" }, { id: "n2" })).toBe(false);
  });

  it("false when building has no tag", () => {
    expect(isTaggedPair({ taggedAsNodeId: undefined }, { id: "n1" })).toBe(false);
  });

  it("false when arguments are missing", () => {
    expect(isTaggedPair(undefined, { id: "n1" })).toBe(false);
    expect(isTaggedPair({ taggedAsNodeId: "n1" }, undefined)).toBe(false);
  });
});
