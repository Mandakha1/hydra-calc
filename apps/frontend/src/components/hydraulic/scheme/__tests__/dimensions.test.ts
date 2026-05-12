/**
 * Phase 6.6.1 — Dimension lines tests.
 *
 * Mix of pure-math helpers (dimensions.ts) and store integration
 * (dimensionApplier.ts).
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  resolveDimensionEndpoints,
  computeDimensionLabel,
  dimensionGeometry,
  dimensionBoundingBox,
} from "../dimensions";
import {
  addDimension,
  updateDimension,
  removeDimension,
  selectDimension,
} from "../dimensionApplier";
import { useHydraulicStore } from "../../hydraulicStore";
import type { SchemeDimension, SchemeNode } from "../../hydraulicTypes";

beforeEach(() => {
  useHydraulicStore.getState().reset();
});

function makeNode(id: string, x: number, y: number, geo?: { lat: number; lon: number }): SchemeNode {
  return {
    id,
    kind: "consumer_apartment",
    label: id,
    x,
    y,
    ...(geo ? { geo } : {}),
  };
}

function makeDim(overrides?: Partial<SchemeDimension>): SchemeDimension {
  return {
    id: "dim1",
    fromNodeId: "a",
    toNodeId: "b",
    offset_px: 30,
    layerKey: "D",
    fromNode_cached_xy: { x: 0, y: 0 },
    toNode_cached_xy: { x: 100, y: 0 },
    ...overrides,
  };
}

describe("resolveDimensionEndpoints — Phase 6.6.1", () => {
  it("resolves live node positions when both anchors exist", () => {
    const nodes = [makeNode("a", 10, 20), makeNode("b", 110, 20)];
    const dim = makeDim();
    const r = resolveDimensionEndpoints(dim, nodes);
    expect(r.orphan).toBe(false);
    expect(r.from).toEqual({ x: 10, y: 20 });
    expect(r.to).toEqual({ x: 110, y: 20 });
    expect(r.fromNode?.id).toBe("a");
    expect(r.toNode?.id).toBe("b");
  });

  it("falls back to cached XY when fromNodeId is missing (orphan)", () => {
    const nodes = [makeNode("b", 110, 20)];
    const dim = makeDim({
      fromNode_cached_xy: { x: 5, y: 7 },
    });
    const r = resolveDimensionEndpoints(dim, nodes);
    expect(r.orphan).toBe(true);
    expect(r.from).toEqual({ x: 5, y: 7 });
    expect(r.to).toEqual({ x: 110, y: 20 });
  });

  it("falls back to cached XY when both anchors are missing", () => {
    const dim = makeDim({
      fromNode_cached_xy: { x: 1, y: 2 },
      toNode_cached_xy: { x: 99, y: 88 },
    });
    const r = resolveDimensionEndpoints(dim, []);
    expect(r.orphan).toBe(true);
    expect(r.from).toEqual({ x: 1, y: 2 });
    expect(r.to).toEqual({ x: 99, y: 88 });
  });
});

describe("computeDimensionLabel — Phase 6.6.1", () => {
  it("uses label override when set", () => {
    const dim = makeDim({ label: "70m (max)" });
    const r = resolveDimensionEndpoints(dim, [makeNode("a", 0, 0), makeNode("b", 100, 0)]);
    expect(computeDimensionLabel(dim, r)).toBe("70m (max)");
  });

  it("auto-Haversine when both nodes have geo", () => {
    const a = makeNode("a", 0, 0, { lat: 47.92, lon: 106.92 });
    // 100 m east of a — about lat 47.92, lon += ~0.00134°
    const b = makeNode("b", 100, 0, { lat: 47.92, lon: 106.92 + 100 / 74628 });
    const dim = makeDim();
    const r = resolveDimensionEndpoints(dim, [a, b]);
    const label = computeDimensionLabel(dim, r);
    expect(label).toMatch(/\d+\.\d+м/);
    // Should be approximately 100m.
    const num = parseFloat(label);
    expect(num).toBeGreaterThan(99);
    expect(num).toBeLessThan(101);
  });

  it("falls back to Euclidean pixel-to-metre when no geo", () => {
    const a = makeNode("a", 0, 0);
    const b = makeNode("b", 100, 0); // 100 px east
    const dim = makeDim();
    const r = resolveDimensionEndpoints(dim, [a, b]);
    const label = computeDimensionLabel(dim, r);
    expect(label).toMatch(/\d+\.\d+м/);
  });
});

describe("dimensionGeometry — Phase 6.6.1", () => {
  it("computes witness + dim line + arrows for horizontal axis", () => {
    const geom = dimensionGeometry({ x: 0, y: 0 }, { x: 100, y: 0 }, 30);
    // For a horizontal axis (left → right), perpendicular = "down" in
    // SVG coords (perp.y > 0). Dim line should be 30px below the axis.
    expect(geom.dimLine.from.y).toBeCloseTo(30, 0);
    expect(geom.dimLine.to.y).toBeCloseTo(30, 0);
    expect(geom.dimLine.from.x).toBe(0);
    expect(geom.dimLine.to.x).toBe(100);
    // Label sits at the midpoint.
    expect(geom.labelPos.x).toBe(50);
    expect(geom.labelPos.y).toBeCloseTo(30, 0);
    expect(geom.angle_deg).toBeCloseTo(0, 4);
  });

  it("handles degenerate (from == to) without throwing", () => {
    const geom = dimensionGeometry({ x: 5, y: 5 }, { x: 5, y: 5 }, 30);
    expect(geom.arrow1Points).toBe("");
    expect(geom.arrow2Points).toBe("");
  });

  it("dimensionBoundingBox covers the witness + dim-line geometry", () => {
    const geom = dimensionGeometry({ x: 0, y: 0 }, { x: 100, y: 0 }, 30);
    const bb = dimensionBoundingBox(geom);
    // The witness lines start with a small gap above the anchor (so
    // there's a visible tick gap, drafting convention). bbox spans
    // from there out to the overhang past the dim line.
    expect(bb.minX).toBe(0);
    expect(bb.maxX).toBe(100);
    // Y span: witness starts near 0 + gap (perp goes "down" in SVG
    // coords for left→right horizontal), dim line at 30 + overhang.
    expect(bb.minY).toBeGreaterThanOrEqual(0);
    expect(bb.maxY).toBeGreaterThan(30);
  });
});

describe("Store integration — Phase 6.6.1", () => {
  it("dimensions field is undefined or empty on a fresh project", () => {
    const dims = useHydraulicStore.getState().dimensions;
    expect(dims === undefined || dims.length === 0).toBe(true);
  });

  it("addDimension inserts into store + snapshots for undo", () => {
    addDimension(makeDim());
    expect(useHydraulicStore.getState().dimensions).toHaveLength(1);
    // Undo stack grew by 1.
    expect(useHydraulicStore.getState().undoStack?.length ?? 0).toBe(1);
  });

  it("updateDimension applies a partial patch", () => {
    addDimension(makeDim());
    updateDimension("dim1", { offset_px: 50, label: "70м" });
    const dims = useHydraulicStore.getState().dimensions!;
    expect(dims[0]!.offset_px).toBe(50);
    expect(dims[0]!.label).toBe("70м");
  });

  it("removeDimension drops it from store + scrubs selection", () => {
    addDimension(makeDim());
    selectDimension("dim1");
    expect(useHydraulicStore.getState().selection?.kind).toBe("dimension");
    removeDimension("dim1");
    expect(useHydraulicStore.getState().dimensions).toEqual([]);
    expect(useHydraulicStore.getState().selection).toBeNull();
    expect(useHydraulicStore.getState().multiSelection.dimensionIds ?? []).toEqual([]);
  });

  it("selectDimension routes through legacy select() with kind='dimension'", () => {
    addDimension(makeDim());
    selectDimension("dim1");
    const s = useHydraulicStore.getState();
    expect(s.selection).toEqual({ kind: "dimension", id: "dim1" });
    expect(s.multiSelection.dimensionIds).toEqual(["dim1"]);
  });

  it("removing an anchor node leaves the dimension in orphan state", () => {
    const st = useHydraulicStore.getState();
    st.addNode(makeNode("a", 0, 0));
    st.addNode(makeNode("b", 100, 0));
    addDimension(makeDim());
    expect(useHydraulicStore.getState().dimensions).toHaveLength(1);
    // Removing node "a" should NOT cascade-delete the dimension.
    st.removeNode("a");
    expect(useHydraulicStore.getState().dimensions).toHaveLength(1);
    // Orphan state: resolve falls back to cached_xy.
    const dim = useHydraulicStore.getState().dimensions![0]!;
    const r = resolveDimensionEndpoints(dim, useHydraulicStore.getState().nodes);
    expect(r.orphan).toBe(true);
    expect(r.from).toEqual({ x: 0, y: 0 });
  });

  it("multi-select via selectExtend works with dimensions", () => {
    addDimension(makeDim());
    addDimension(makeDim({ id: "dim2" }));
    const st = useHydraulicStore.getState();
    st.selectExtend({ kind: "dimension", id: "dim1" });
    st.selectExtend({ kind: "dimension", id: "dim2" });
    expect(useHydraulicStore.getState().multiSelection.dimensionIds).toEqual([
      "dim1",
      "dim2",
    ]);
  });
});
