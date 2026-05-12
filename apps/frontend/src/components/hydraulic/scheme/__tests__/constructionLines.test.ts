/**
 * Phase 6.6.2 — Construction line tests.
 *
 * Mix of pure-math helpers (constructionLines.ts), applier integration
 * (constructionLineApplier.ts), selection integration via the store,
 * and the 6.6.1 follow-on fix where the undo stack now actually
 * round-trips dimensions + construction lines (Phase 6.6.1 declared
 * the snapshot field but never read/wrote it).
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  strokeDasharrayForStyle,
  constructionLineLength,
  constructionLineMidpoint,
  constructionLineBoundingBox,
  distanceFromPointToSegment,
  isPointNearConstructionLine,
} from "../constructionLines";
import {
  addConstructionLine,
  updateConstructionLine,
  removeConstructionLine,
  selectConstructionLine,
} from "../constructionLineApplier";
import { addDimension } from "../dimensionApplier";
import { pushUndoSnapshot, undo, redo } from "../undoStack";
import { useHydraulicStore } from "../../hydraulicStore";
import { PX_PER_METER } from "../../nodeCatalog";
import type { SchemeConstructionLine, SchemeDimension } from "../../hydraulicTypes";

beforeEach(() => {
  useHydraulicStore.getState().reset();
});

function makeCL(overrides?: Partial<SchemeConstructionLine>): SchemeConstructionLine {
  return {
    id: "cl1",
    from: { x: 0, y: 0 },
    to: { x: 100, y: 0 },
    layerKey: "C",
    style: "dashed",
    ...overrides,
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

describe("strokeDasharrayForStyle — Phase 6.6.2", () => {
  it("solid → no dash array", () => {
    expect(strokeDasharrayForStyle("solid")).toBeUndefined();
  });

  it("dashed (default) → 6 4", () => {
    expect(strokeDasharrayForStyle("dashed")).toBe("6 4");
    expect(strokeDasharrayForStyle(undefined)).toBe("6 4");
  });

  it("dotted → 1 3", () => {
    expect(strokeDasharrayForStyle("dotted")).toBe("1 3");
  });
});

describe("constructionLineLength — Phase 6.6.2", () => {
  it("converts horizontal pixel distance to metres", () => {
    const cl = makeCL({ from: { x: 0, y: 0 }, to: { x: PX_PER_METER, y: 0 } });
    expect(constructionLineLength(cl)).toBeCloseTo(1, 4);
  });

  it("handles 3-4-5 triangle", () => {
    const cl = makeCL({
      from: { x: 0, y: 0 },
      to: { x: 3 * PX_PER_METER, y: 4 * PX_PER_METER },
    });
    expect(constructionLineLength(cl)).toBeCloseTo(5, 4);
  });

  it("degenerate (from == to) returns 0", () => {
    const cl = makeCL({ from: { x: 5, y: 5 }, to: { x: 5, y: 5 } });
    expect(constructionLineLength(cl)).toBe(0);
  });
});

describe("constructionLineMidpoint + boundingBox — Phase 6.6.2", () => {
  it("midpoint of (0,0)→(100,40) is (50,20)", () => {
    const cl = makeCL({ from: { x: 0, y: 0 }, to: { x: 100, y: 40 } });
    expect(constructionLineMidpoint(cl)).toEqual({ x: 50, y: 20 });
  });

  it("bounding box covers both endpoints regardless of order", () => {
    const cl = makeCL({ from: { x: 200, y: 50 }, to: { x: -30, y: 80 } });
    const bb = constructionLineBoundingBox(cl);
    expect(bb.minX).toBe(-30);
    expect(bb.maxX).toBe(200);
    expect(bb.minY).toBe(50);
    expect(bb.maxY).toBe(80);
  });
});

describe("distanceFromPointToSegment — Phase 6.6.2", () => {
  it("perpendicular distance to a horizontal segment", () => {
    // segment (0,0)→(100,0), point (50, 5) → distance 5
    const d = distanceFromPointToSegment(
      { x: 50, y: 5 },
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    );
    expect(d).toBeCloseTo(5, 4);
  });

  it("clamps to endpoint when projection falls outside segment", () => {
    // segment (0,0)→(100,0), point (110, 0) → distance 10 (to endpoint b)
    const d = distanceFromPointToSegment(
      { x: 110, y: 0 },
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    );
    expect(d).toBeCloseTo(10, 4);
  });

  it("degenerate (a == b) returns plain Euclidean distance", () => {
    const d = distanceFromPointToSegment(
      { x: 3, y: 4 },
      { x: 0, y: 0 },
      { x: 0, y: 0 },
    );
    expect(d).toBeCloseTo(5, 4);
  });
});

describe("isPointNearConstructionLine — Phase 6.6.2", () => {
  it("returns true when within tolerance", () => {
    const cl = makeCL();
    expect(isPointNearConstructionLine({ x: 50, y: 3 }, cl, 6)).toBe(true);
  });

  it("returns false when outside tolerance", () => {
    const cl = makeCL();
    expect(isPointNearConstructionLine({ x: 50, y: 10 }, cl, 6)).toBe(false);
  });
});

describe("Store integration — Phase 6.6.2", () => {
  it("constructionLines field is undefined or empty on a fresh project", () => {
    const cls = useHydraulicStore.getState().constructionLines;
    expect(cls === undefined || cls.length === 0).toBe(true);
  });

  it("addConstructionLine inserts into store + snapshots for undo", () => {
    addConstructionLine(makeCL());
    expect(useHydraulicStore.getState().constructionLines).toHaveLength(1);
    expect(useHydraulicStore.getState().undoStack?.length ?? 0).toBe(1);
  });

  it("updateConstructionLine applies a partial patch", () => {
    addConstructionLine(makeCL());
    updateConstructionLine("cl1", { label: "А-А", style: "solid" });
    const cls = useHydraulicStore.getState().constructionLines!;
    expect(cls[0]!.label).toBe("А-А");
    expect(cls[0]!.style).toBe("solid");
  });

  it("removeConstructionLine drops it + scrubs selection", () => {
    addConstructionLine(makeCL());
    selectConstructionLine("cl1");
    expect(useHydraulicStore.getState().selection?.kind).toBe("constructionLine");
    removeConstructionLine("cl1");
    expect(useHydraulicStore.getState().constructionLines).toEqual([]);
    expect(useHydraulicStore.getState().selection).toBeNull();
    expect(useHydraulicStore.getState().multiSelection.constructionLineIds ?? []).toEqual([]);
  });

  it("selectConstructionLine routes through legacy select() with kind='constructionLine'", () => {
    addConstructionLine(makeCL());
    selectConstructionLine("cl1");
    const s = useHydraulicStore.getState();
    expect(s.selection).toEqual({ kind: "constructionLine", id: "cl1" });
    expect(s.multiSelection.constructionLineIds).toEqual(["cl1"]);
  });

  it("removing an unrelated node leaves construction lines untouched", () => {
    const st = useHydraulicStore.getState();
    st.addNode({
      id: "n1",
      kind: "consumer_apartment",
      label: "Test",
      x: 200,
      y: 200,
    });
    addConstructionLine(makeCL());
    expect(useHydraulicStore.getState().constructionLines).toHaveLength(1);
    st.removeNode("n1");
    // Construction lines have no node anchor → no cascade.
    expect(useHydraulicStore.getState().constructionLines).toHaveLength(1);
  });

  it("multi-select via selectExtend works with construction lines", () => {
    addConstructionLine(makeCL());
    addConstructionLine(makeCL({ id: "cl2" }));
    const st = useHydraulicStore.getState();
    st.selectExtend({ kind: "constructionLine", id: "cl1" });
    st.selectExtend({ kind: "constructionLine", id: "cl2" });
    expect(useHydraulicStore.getState().multiSelection.constructionLineIds).toEqual([
      "cl1",
      "cl2",
    ]);
  });

  it("multi-select via selectMany preserves construction-line ids", () => {
    const st = useHydraulicStore.getState();
    st.selectMany({
      nodeIds: [],
      pipeIds: [],
      constructionLineIds: ["cl1", "cl2"],
    });
    const s = useHydraulicStore.getState();
    expect(s.multiSelection.constructionLineIds).toEqual(["cl1", "cl2"]);
    // Legacy selection follows the first non-empty list (no nodes/pipes → cl).
    expect(s.selection).toEqual({ kind: "constructionLine", id: "cl1" });
  });
});

describe("Undo stack round-trip for drafting aids — Phase 6.6.2 fixes 6.6.1 gap", () => {
  it("undo restores dimensions array (was a silent no-op in 6.6.1)", () => {
    addDimension(makeDim());
    expect(useHydraulicStore.getState().dimensions).toHaveLength(1);
    // Pushing a snapshot then mutating then undoing should restore.
    pushUndoSnapshot("Туршилт", 1);
    useHydraulicStore.setState({ dimensions: [] });
    expect(useHydraulicStore.getState().dimensions).toEqual([]);
    undo();
    expect(useHydraulicStore.getState().dimensions).toHaveLength(1);
  });

  it("undo restores constructionLines array", () => {
    addConstructionLine(makeCL());
    expect(useHydraulicStore.getState().constructionLines).toHaveLength(1);
    pushUndoSnapshot("Туршилт", 1);
    useHydraulicStore.setState({ constructionLines: [] });
    expect(useHydraulicStore.getState().constructionLines).toEqual([]);
    undo();
    expect(useHydraulicStore.getState().constructionLines).toHaveLength(1);
  });

  it("redo restores mutation after undo", () => {
    addConstructionLine(makeCL());
    pushUndoSnapshot("Туршилт", 1);
    useHydraulicStore.setState({ constructionLines: [] });
    undo();
    expect(useHydraulicStore.getState().constructionLines).toHaveLength(1);
    redo();
    expect(useHydraulicStore.getState().constructionLines).toEqual([]);
  });
});
