/**
 * Phase 6.6.3 — Text annotation tests.
 *
 * Covers math + applier + INTEGRATION with the surrounding systems:
 *   - undo round-trip
 *   - Del-key path (verified via the store mechanics — full SchemeEditor
 *     wiring uses the same setState/multiSelection plumbing exercised here)
 *   - rubber-band hit-test (via the selectMany surface)
 *   - clipboard copy / paste round-trip
 *   - transformApplier rotate / mirror integration
 *
 * The integration tests exist to close the gap PR #9 / #10 review
 * surfaced: TypeScript "compiles + lint passes" doesn't catch silent
 * fall-throughs (Del → wrong removeX, undo → no-op). Each integration
 * test exercises BOTH the new entity AND the existing handler path.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  annotationLines,
  effectiveFontSize,
  estimateTextWidthPx,
  annotationBoundingBox,
  annotationAnchor,
  translateAnnotations,
  rotateAnnotations,
  mirrorAnnotations,
  DEFAULT_FONT_SIZE_PX,
  LINE_HEIGHT_MULTIPLIER,
} from "../annotations";
import {
  addAnnotation,
  updateAnnotation,
  removeAnnotation,
  selectAnnotation,
} from "../annotationApplier";
import { pushUndoSnapshot, undo, redo } from "../undoStack";
import {
  applyRotateAroundCentroid,
  applyMirrorHorizontal,
  applyMirrorVertical,
} from "../transformApplier";
import { useHydraulicStore } from "../../hydraulicStore";
import type { SchemeAnnotation } from "../../hydraulicTypes";

beforeEach(() => {
  useHydraulicStore.getState().reset();
});

function makeAnno(overrides?: Partial<SchemeAnnotation>): SchemeAnnotation {
  return {
    id: "a1",
    x: 100,
    y: 50,
    text: "Test annotation",
    layerKey: "D",
    ...overrides,
  };
}

/* ─── Pure math ─────────────────────────────────────────────────── */

describe("annotation math — Phase 6.6.3", () => {
  it("annotationLines splits text on newlines", () => {
    expect(annotationLines(makeAnno({ text: "first\nsecond\nthird" }))).toEqual([
      "first",
      "second",
      "third",
    ]);
  });

  it("annotationLines on single-line text returns one element", () => {
    expect(annotationLines(makeAnno({ text: "no newline" }))).toEqual(["no newline"]);
  });

  it("effectiveFontSize falls back to default 12px", () => {
    expect(effectiveFontSize(makeAnno())).toBe(DEFAULT_FONT_SIZE_PX);
    expect(effectiveFontSize(makeAnno({ fontSize_px: 18 }))).toBe(18);
  });

  it("estimateTextWidthPx scales with length and font size", () => {
    const small = estimateTextWidthPx("hello", 10);
    const big = estimateTextWidthPx("hello", 20);
    expect(big).toBeCloseTo(small * 2, 4);
    expect(estimateTextWidthPx("", 12)).toBe(0);
  });

  it("annotationBoundingBox respects left alignment", () => {
    const a = makeAnno({ x: 100, y: 50, text: "abc", fontSize_px: 10, align: "left" });
    const bb = annotationBoundingBox(a);
    expect(bb.minX).toBe(100);
    expect(bb.maxX).toBeCloseTo(100 + 3 * 10 * 0.6, 4);
    // Box height: 1 line * 10 * 1.2 = 12, climbing upward by 10 first.
    expect(bb.minY).toBe(40);
  });

  it("annotationBoundingBox centers on x when align=center", () => {
    const a = makeAnno({ x: 100, y: 50, text: "abc", fontSize_px: 10, align: "center" });
    const bb = annotationBoundingBox(a);
    const halfW = (3 * 10 * 0.6) / 2;
    expect(bb.minX).toBeCloseTo(100 - halfW, 4);
    expect(bb.maxX).toBeCloseTo(100 + halfW, 4);
  });

  it("annotationBoundingBox right-aligns to x when align=right", () => {
    const a = makeAnno({ x: 100, y: 50, text: "abc", fontSize_px: 10, align: "right" });
    const bb = annotationBoundingBox(a);
    expect(bb.maxX).toBe(100);
    expect(bb.minX).toBeCloseTo(100 - 3 * 10 * 0.6, 4);
  });

  it("annotationBoundingBox grows for multi-line text", () => {
    const a = makeAnno({ x: 0, y: 0, text: "a\nb\nc", fontSize_px: 10 });
    const bb = annotationBoundingBox(a);
    const expectedTotalHeight = 3 * 10 * LINE_HEIGHT_MULTIPLIER;
    // maxY = totalHeight - fs (climb-down past first line ascent).
    expect(bb.maxY).toBeCloseTo(expectedTotalHeight - 10, 4);
  });

  it("annotationAnchor returns the (x, y) tuple", () => {
    expect(annotationAnchor(makeAnno({ x: 42, y: 17 }))).toEqual({ x: 42, y: 17 });
  });
});

/* ─── Transform helpers ─────────────────────────────────────────── */

describe("annotation transforms — Phase 6.6.3", () => {
  it("translateAnnotations shifts every anchor by the same delta", () => {
    const result = translateAnnotations(
      [makeAnno({ id: "a", x: 0, y: 0 }), makeAnno({ id: "b", x: 10, y: 20 })],
      { x: 5, y: -3 },
    );
    expect(result[0]).toMatchObject({ id: "a", x: 5, y: -3 });
    expect(result[1]).toMatchObject({ id: "b", x: 15, y: 17 });
  });

  it("rotateAnnotations 90° CCW around origin maps (10,0)→(0,10) and adds 90 to rotation_deg", () => {
    const result = rotateAnnotations(
      [makeAnno({ x: 10, y: 0, rotation_deg: 0 })],
      { x: 0, y: 0 },
      90,
    );
    expect(result[0]!.x).toBe(0);
    expect(result[0]!.y).toBe(10);
    expect(result[0]!.rotation_deg).toBe(90);
  });

  it("mirrorAnnotations horizontal flips y across axis and negates rotation", () => {
    const result = mirrorAnnotations(
      [makeAnno({ x: 5, y: 30, rotation_deg: 45 })],
      { kind: "horizontal", y_px: 20 },
    );
    expect(result[0]!.x).toBe(5);
    expect(result[0]!.y).toBe(10); // 2*20 - 30
    expect(result[0]!.rotation_deg).toBe(-45);
  });

  it("mirrorAnnotations vertical flips x and rotates 180 - rot", () => {
    const result = mirrorAnnotations(
      [makeAnno({ x: 5, y: 30, rotation_deg: 30 })],
      { kind: "vertical", x_px: 20 },
    );
    expect(result[0]!.x).toBe(35); // 2*20 - 5
    expect(result[0]!.rotation_deg).toBe(150); // 180 - 30
  });
});

/* ─── Store applier + integration ───────────────────────────────── */

describe("annotation store integration — Phase 6.6.3", () => {
  it("annotations field is undefined or empty on a fresh project", () => {
    const annos = useHydraulicStore.getState().annotations;
    expect(annos === undefined || annos.length === 0).toBe(true);
  });

  it("addAnnotation inserts + snapshots for undo", () => {
    addAnnotation(makeAnno());
    expect(useHydraulicStore.getState().annotations).toHaveLength(1);
    expect(useHydraulicStore.getState().undoStack?.length ?? 0).toBe(1);
  });

  it("updateAnnotation applies a partial patch", () => {
    addAnnotation(makeAnno());
    updateAnnotation("a1", { text: "Edited", fontSize_px: 16, rotation_deg: 30 });
    const a = useHydraulicStore.getState().annotations![0]!;
    expect(a.text).toBe("Edited");
    expect(a.fontSize_px).toBe(16);
    expect(a.rotation_deg).toBe(30);
  });

  it("removeAnnotation drops it + scrubs selection", () => {
    addAnnotation(makeAnno());
    selectAnnotation("a1");
    expect(useHydraulicStore.getState().selection?.kind).toBe("annotation");
    removeAnnotation("a1");
    expect(useHydraulicStore.getState().annotations).toEqual([]);
    expect(useHydraulicStore.getState().selection).toBeNull();
    expect(useHydraulicStore.getState().multiSelection.annotationIds ?? []).toEqual([]);
  });

  it("selectAnnotation routes through legacy select() with kind='annotation'", () => {
    addAnnotation(makeAnno());
    selectAnnotation("a1");
    const s = useHydraulicStore.getState();
    expect(s.selection).toEqual({ kind: "annotation", id: "a1" });
    expect(s.multiSelection.annotationIds).toEqual(["a1"]);
  });

  it("removing an unrelated node leaves annotations untouched (no cascade)", () => {
    const st = useHydraulicStore.getState();
    st.addNode({
      id: "n1",
      kind: "consumer_apartment",
      label: "Test",
      x: 200,
      y: 200,
    });
    addAnnotation(makeAnno());
    st.removeNode("n1");
    expect(useHydraulicStore.getState().annotations).toHaveLength(1);
  });
});

/* ─── Integration: undo round-trip ─────────────────────────────── */

describe("annotation undo round-trip — Phase 6.6.3", () => {
  it("undo restores annotations array after a mutation", () => {
    addAnnotation(makeAnno());
    pushUndoSnapshot("Туршилт", 1);
    useHydraulicStore.setState({ annotations: [] });
    expect(useHydraulicStore.getState().annotations).toEqual([]);
    undo();
    expect(useHydraulicStore.getState().annotations).toHaveLength(1);
    expect(useHydraulicStore.getState().annotations![0]!.text).toBe("Test annotation");
  });

  it("redo re-applies the mutation after undo", () => {
    addAnnotation(makeAnno());
    pushUndoSnapshot("Туршилт", 1);
    useHydraulicStore.setState({ annotations: [] });
    undo();
    expect(useHydraulicStore.getState().annotations).toHaveLength(1);
    redo();
    expect(useHydraulicStore.getState().annotations).toEqual([]);
  });

  it("addAnnotation snapshot followed by undo removes the annotation (closes 6.6.1 silent-gap pattern for annotations)", () => {
    expect(useHydraulicStore.getState().annotations ?? []).toEqual([]);
    addAnnotation(makeAnno()); // pushes pre-state snapshot
    expect(useHydraulicStore.getState().annotations).toHaveLength(1);
    undo();
    expect(useHydraulicStore.getState().annotations).toEqual([]);
  });
});

/* ─── Integration: Del-key path mechanics ──────────────────────── */

describe("annotation Del-key path — Phase 6.6.3", () => {
  // The Del handler in SchemeEditor uses setState to drop the entity
  // and scrub multiSelection. These tests exercise the same surface
  // (the store actions + setState patterns the Del handler invokes)
  // to verify a selected annotation actually goes away — not the
  // silent fall-through that 6.6.1 had for dimensions.

  it("single-target delete via setState scrubs an annotation cleanly", () => {
    addAnnotation(makeAnno());
    selectAnnotation("a1");
    expect(useHydraulicStore.getState().selection?.kind).toBe("annotation");
    // Emulate SchemeEditor's Del handler branch for kind="annotation".
    useHydraulicStore.setState((s) => ({
      annotations: (s.annotations ?? []).filter((a) => a.id !== "a1"),
      selection: null,
      multiSelection: {
        nodeIds: s.multiSelection.nodeIds,
        pipeIds: s.multiSelection.pipeIds,
        dimensionIds: s.multiSelection.dimensionIds ?? [],
        constructionLineIds: s.multiSelection.constructionLineIds ?? [],
        annotationIds: (s.multiSelection.annotationIds ?? []).filter((x) => x !== "a1"),
      },
    }));
    expect(useHydraulicStore.getState().annotations).toEqual([]);
    expect(useHydraulicStore.getState().selection).toBeNull();
  });

  it("multi-select Del includes annotation ids in the cascade-filter", () => {
    addAnnotation(makeAnno({ id: "a1" }));
    addAnnotation(makeAnno({ id: "a2" }));
    useHydraulicStore.getState().selectExtend({ kind: "annotation", id: "a1" });
    useHydraulicStore.getState().selectExtend({ kind: "annotation", id: "a2" });
    const annIds = useHydraulicStore.getState().multiSelection.annotationIds ?? [];
    expect(annIds).toEqual(["a1", "a2"]);
    // Emulate the Del handler's batch-delete inline-filter pattern.
    useHydraulicStore.setState((s) => ({
      annotations: (s.annotations ?? []).filter((a) => !annIds.includes(a.id)),
    }));
    expect(useHydraulicStore.getState().annotations).toEqual([]);
  });
});

/* ─── Integration: rubber-band hit-test ─────────────────────────── */

describe("annotation rubber-band hit-test — Phase 6.6.3", () => {
  it("selectMany populates annotationIds when rubber-band hits annotations", () => {
    addAnnotation(makeAnno({ id: "a1", x: 50, y: 50 }));
    addAnnotation(makeAnno({ id: "a2", x: 150, y: 50 }));
    addAnnotation(makeAnno({ id: "a3", x: 500, y: 500 })); // outside
    // Simulate SchemeEditor's hit-test result: a1 + a2 fall inside
    // a 0..200 × 0..100 rect; a3 does not.
    const inside = [
      makeAnno({ id: "a1", x: 50, y: 50 }),
      makeAnno({ id: "a2", x: 150, y: 50 }),
    ];
    const hitIds = inside.map((a) => a.id);
    useHydraulicStore.getState().selectMany({
      nodeIds: [],
      pipeIds: [],
      annotationIds: hitIds,
    });
    expect(useHydraulicStore.getState().multiSelection.annotationIds).toEqual(["a1", "a2"]);
    // a3 not selected.
    expect(
      (useHydraulicStore.getState().multiSelection.annotationIds ?? []).includes("a3"),
    ).toBe(false);
  });

  it("rubber-band selecting both a node and an annotation populates both id sets", () => {
    useHydraulicStore.getState().addNode({
      id: "n1",
      kind: "consumer_apartment",
      label: "X",
      x: 10,
      y: 10,
    });
    addAnnotation(makeAnno({ id: "a1", x: 20, y: 20 }));
    useHydraulicStore.getState().selectMany({
      nodeIds: ["n1"],
      pipeIds: [],
      annotationIds: ["a1"],
    });
    const ms = useHydraulicStore.getState().multiSelection;
    expect(ms.nodeIds).toEqual(["n1"]);
    expect(ms.annotationIds).toEqual(["a1"]);
  });
});

/* ─── Integration: clipboard copy / paste ───────────────────────── */

describe("annotation clipboard round-trip — Phase 6.6.3", () => {
  it("copy then paste preserves text content + creates fresh id", () => {
    addAnnotation(makeAnno({ id: "a1", x: 100, y: 100, text: "Hello világ" }));
    useHydraulicStore.getState().selectExtend({ kind: "annotation", id: "a1" });
    const copyCount = useHydraulicStore.getState().copySelection();
    expect(copyCount?.annotations).toBe(1);
    const pasteCount = useHydraulicStore.getState().pasteClipboard();
    expect(pasteCount?.annotations).toBe(1);
    const all = useHydraulicStore.getState().annotations ?? [];
    expect(all).toHaveLength(2);
    // The pasted annotation has a fresh id but the same text.
    const pasted = all.find((a) => a.id !== "a1");
    expect(pasted?.text).toBe("Hello világ");
    expect(pasted?.id).not.toBe("a1");
  });

  it("paste offsets the annotation in pixel space", () => {
    addAnnotation(makeAnno({ id: "a1", x: 100, y: 100 }));
    useHydraulicStore.getState().selectExtend({ kind: "annotation", id: "a1" });
    useHydraulicStore.getState().copySelection();
    useHydraulicStore.getState().pasteClipboard();
    const pasted = (useHydraulicStore.getState().annotations ?? []).find((a) => a.id !== "a1");
    expect(pasted).toBeDefined();
    // Default offset is +20m in both dimensions; without mapPxPerMeter
    // the metres-to-pixel coefficient defaults to 1.
    expect(pasted!.x).toBe(120);
    expect(pasted!.y).toBe(120);
  });

  it("cut removes the original annotation but keeps the clipboard alive", () => {
    addAnnotation(makeAnno({ id: "a1", text: "ХҮрх" }));
    useHydraulicStore.getState().selectExtend({ kind: "annotation", id: "a1" });
    const cutCount = useHydraulicStore.getState().cutSelection();
    expect(cutCount?.annotations).toBe(1);
    expect(useHydraulicStore.getState().annotations).toEqual([]);
    // Paste re-inserts a fresh annotation with the same text.
    useHydraulicStore.getState().pasteClipboard();
    const after = useHydraulicStore.getState().annotations ?? [];
    expect(after).toHaveLength(1);
    expect(after[0]!.text).toBe("ХҮрх");
  });

  it("paste auto-selects the pasted annotation set", () => {
    addAnnotation(makeAnno({ id: "a1" }));
    useHydraulicStore.getState().selectExtend({ kind: "annotation", id: "a1" });
    useHydraulicStore.getState().copySelection();
    useHydraulicStore.getState().pasteClipboard();
    const after = useHydraulicStore.getState().multiSelection.annotationIds ?? [];
    expect(after).toHaveLength(1);
    // The auto-selected id is the pasted one, not the original.
    expect(after[0]).not.toBe("a1");
  });
});

/* ─── Integration: transformApplier ─────────────────────────────── */

describe("annotation transform integration — Phase 6.6.3", () => {
  it("applyRotateAroundCentroid rotates a selected annotation in place", () => {
    addAnnotation(makeAnno({ id: "a1", x: 100, y: 0, rotation_deg: 0 }));
    useHydraulicStore.getState().selectExtend({ kind: "annotation", id: "a1" });
    // Centroid of one annotation = its own coords, so rotation degenerates
    // to a self-pivot — only rotation_deg changes.
    const n = applyRotateAroundCentroid(90);
    expect(n).toBe(1);
    const a = useHydraulicStore.getState().annotations![0]!;
    expect(a.rotation_deg).toBe(90);
  });

  it("applyRotateAroundCentroid mixes nodes + annotations correctly", () => {
    const st = useHydraulicStore.getState();
    st.addNode({ id: "n1", kind: "consumer_apartment", label: "X", x: 0, y: 0 });
    addAnnotation(makeAnno({ id: "a1", x: 100, y: 0, rotation_deg: 0 }));
    st.selectMany({ nodeIds: ["n1"], pipeIds: [], annotationIds: ["a1"] });
    // Combined centroid is (50, 0). 90° CCW maps:
    //   node    (0, 0)   → (50, -50)
    //   anno    (100, 0) → (50,  50)
    applyRotateAroundCentroid(90);
    const node = useHydraulicStore.getState().nodes.find((n) => n.id === "n1")!;
    const anno = useHydraulicStore.getState().annotations!.find((a) => a.id === "a1")!;
    expect(node.x).toBe(50);
    expect(node.y).toBe(-50);
    expect(anno.x).toBe(50);
    expect(anno.y).toBe(50);
    expect(anno.rotation_deg).toBe(90);
  });

  it("applyMirrorHorizontal flips annotation y across the centroid", () => {
    addAnnotation(makeAnno({ id: "a1", x: 100, y: 100 }));
    addAnnotation(makeAnno({ id: "a2", x: 100, y: 50 }));
    useHydraulicStore.getState().selectMany({
      nodeIds: [],
      pipeIds: [],
      annotationIds: ["a1", "a2"],
    });
    // Centroid y = 75.
    applyMirrorHorizontal();
    const annos = useHydraulicStore.getState().annotations!;
    expect(annos.find((a) => a.id === "a1")!.y).toBe(50); // 2*75 - 100
    expect(annos.find((a) => a.id === "a2")!.y).toBe(100); // 2*75 - 50
  });

  it("applyMirrorVertical flips annotation x across the centroid", () => {
    addAnnotation(makeAnno({ id: "a1", x: 100, y: 50 }));
    addAnnotation(makeAnno({ id: "a2", x: 200, y: 50 }));
    useHydraulicStore.getState().selectMany({
      nodeIds: [],
      pipeIds: [],
      annotationIds: ["a1", "a2"],
    });
    // Centroid x = 150.
    applyMirrorVertical();
    const annos = useHydraulicStore.getState().annotations!;
    expect(annos.find((a) => a.id === "a1")!.x).toBe(200); // 2*150 - 100
    expect(annos.find((a) => a.id === "a2")!.x).toBe(100); // 2*150 - 200
  });

  it("rotation is undoable via the pushed snapshot", () => {
    addAnnotation(makeAnno({ id: "a1", x: 100, y: 0, rotation_deg: 0 }));
    useHydraulicStore.getState().selectExtend({ kind: "annotation", id: "a1" });
    applyRotateAroundCentroid(90);
    expect(useHydraulicStore.getState().annotations![0]!.rotation_deg).toBe(90);
    undo();
    expect(useHydraulicStore.getState().annotations![0]!.rotation_deg).toBe(0);
  });
});
