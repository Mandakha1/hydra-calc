/**
 * Phase 6.7.3 — North arrow tests.
 *
 * Covers pure math (defaults / hit-test / clamp) + the
 * singleton-selection integration with the store (the new
 * "northArrow" kind in SelectionTarget). The PR #10/#11 lesson —
 * "verify integration, not just typecheck" — drives the bottom
 * half of this file: explicit pinning that selectToggle /
 * selectExtend bypass multiSelection for singletons.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  NORTH_ARROW_VISUAL_MM,
  NORTH_ARROW_ASPECT,
  NORTH_ARROW_CORNER_PADDING_PX,
  NORTH_ARROW_CANVAS_MMTOPX,
  defaultNorthArrowPosition,
  applyNorthArrowDefaults,
  northArrowBoundingBox,
  isPointInsideNorthArrow,
  clampNorthArrowPosition,
} from "../northArrowMeta";
import { useHydraulicStore } from "../../hydraulicStore";
import { pushUndoSnapshot } from "../undoStack";

beforeEach(() => {
  useHydraulicStore.getState().reset();
});

describe("northArrow defaults — Phase 6.7.3", () => {
  it("default position sits at viewport top-right with padding", () => {
    const widthMm = NORTH_ARROW_VISUAL_MM * NORTH_ARROW_ASPECT * NORTH_ARROW_CANVAS_MMTOPX;
    const pos = defaultNorthArrowPosition(1000, 800);
    // x_px = viewportWidth - arrowWidth - padding
    expect(pos.x_px).toBeCloseTo(1000 - widthMm - NORTH_ARROW_CORNER_PADDING_PX, 4);
    // y_px = padding (top edge)
    expect(pos.y_px).toBe(NORTH_ARROW_CORNER_PADDING_PX);
  });

  it("default position clamps to x_px=0 for tiny viewports", () => {
    const pos = defaultNorthArrowPosition(5, 5);
    expect(pos.x_px).toBe(0);
    expect(pos.y_px).toBe(NORTH_ARROW_CORNER_PADDING_PX);
  });

  it("applyNorthArrowDefaults fills missing fields", () => {
    const d = applyNorthArrowDefaults(undefined, 1000, 800);
    expect(d.rotation_deg).toBe(0);
    expect(d.x_px).toBeGreaterThan(900); // top-right corner
    expect(d.y_px).toBe(20);
  });

  it("applyNorthArrowDefaults preserves engineer-supplied values", () => {
    const d = applyNorthArrowDefaults(
      { x_px: 100, y_px: 50, rotation_deg: 30 },
      1000,
      800,
    );
    expect(d.x_px).toBe(100);
    expect(d.y_px).toBe(50);
    expect(d.rotation_deg).toBe(30);
  });

  it("rotation_deg defaults to 0 when only position is set", () => {
    const d = applyNorthArrowDefaults({ x_px: 100, y_px: 50 }, 1000, 800);
    expect(d.rotation_deg).toBe(0);
  });
});

describe("northArrowBoundingBox — Phase 6.7.3", () => {
  it("returns width × height matching mm × mmToPx", () => {
    const bb = northArrowBoundingBox(100, 50);
    expect(bb.height).toBeCloseTo(NORTH_ARROW_VISUAL_MM * NORTH_ARROW_CANVAS_MMTOPX, 4);
    expect(bb.width).toBeCloseTo(bb.height * NORTH_ARROW_ASPECT, 4);
  });

  it("min/max corners follow the x/y position", () => {
    const bb = northArrowBoundingBox(100, 50);
    expect(bb.minX).toBe(100);
    expect(bb.minY).toBe(50);
    expect(bb.maxX).toBeCloseTo(100 + bb.width, 4);
    expect(bb.maxY).toBeCloseTo(50 + bb.height, 4);
  });
});

describe("isPointInsideNorthArrow — Phase 6.7.3", () => {
  it("returns true for a point at the centre of the default-placed arrow", () => {
    const def = defaultNorthArrowPosition(1000, 800);
    const bb = northArrowBoundingBox(def.x_px, def.y_px);
    const centre = {
      x: (bb.minX + bb.maxX) / 2,
      y: (bb.minY + bb.maxY) / 2,
    };
    expect(isPointInsideNorthArrow(centre, undefined, 1000, 800)).toBe(true);
  });

  it("returns false for a point clearly outside (canvas centre)", () => {
    expect(isPointInsideNorthArrow({ x: 500, y: 400 }, undefined, 1000, 800)).toBe(false);
  });

  it("honours an engineer-supplied position when testing", () => {
    const meta = { x_px: 200, y_px: 100, rotation_deg: 0 };
    // Centre of the box at (200, 100).
    const bb = northArrowBoundingBox(200, 100);
    const centre = {
      x: (bb.minX + bb.maxX) / 2,
      y: (bb.minY + bb.maxY) / 2,
    };
    expect(isPointInsideNorthArrow(centre, meta, 1000, 800)).toBe(true);
    // Far away — not inside.
    expect(isPointInsideNorthArrow({ x: 900, y: 50 }, meta, 1000, 800)).toBe(false);
  });
});

describe("clampNorthArrowPosition — Phase 6.7.3", () => {
  it("keeps in-bounds coords untouched", () => {
    const c = clampNorthArrowPosition(100, 100, 1000, 800);
    expect(c.x_px).toBe(100);
    expect(c.y_px).toBe(100);
  });

  it("clamps negative coords to zero", () => {
    const c = clampNorthArrowPosition(-50, -10, 1000, 800);
    expect(c.x_px).toBe(0);
    expect(c.y_px).toBe(0);
  });

  it("clamps too-far-right / too-far-down so the arrow stays fully on-screen", () => {
    const c = clampNorthArrowPosition(5000, 5000, 1000, 800);
    const bb = northArrowBoundingBox(0, 0);
    expect(c.x_px).toBeCloseTo(1000 - bb.width, 4);
    expect(c.y_px).toBeCloseTo(800 - bb.height, 4);
  });
});

describe("Selection-singleton integration — Phase 6.7.3", () => {
  it("select() routes through to the legacy selection field", () => {
    useHydraulicStore.getState().select({ kind: "northArrow", id: "" });
    expect(useHydraulicStore.getState().selection).toEqual({
      kind: "northArrow",
      id: "",
    });
  });

  it("selecting the north arrow CLEARS existing multiSelection (so inspector switches cleanly)", () => {
    const st = useHydraulicStore.getState();
    // Prime with a real node multi-selection.
    st.addNode({ id: "n1", kind: "consumer_apartment", label: "X", x: 0, y: 0 });
    st.selectExtend({ kind: "node", id: "n1" });
    expect(useHydraulicStore.getState().multiSelection.nodeIds).toEqual(["n1"]);
    // Now select the north arrow.
    useHydraulicStore.getState().select({ kind: "northArrow", id: "" });
    expect(useHydraulicStore.getState().multiSelection.nodeIds).toEqual([]);
    expect(useHydraulicStore.getState().multiSelection.annotationIds).toEqual([]);
  });

  it("selectToggle on the singleton toggles the legacy field on/off without touching multiSelection", () => {
    const st = useHydraulicStore.getState();
    // Prime with an unrelated node selection.
    st.addNode({ id: "n1", kind: "consumer_apartment", label: "X", x: 0, y: 0 });
    st.selectExtend({ kind: "node", id: "n1" });
    const msBefore = useHydraulicStore.getState().multiSelection;
    // Toggle north arrow on.
    st.selectToggle({ kind: "northArrow", id: "" });
    let after = useHydraulicStore.getState();
    expect(after.selection?.kind).toBe("northArrow");
    // multiSelection unchanged.
    expect(after.multiSelection).toEqual(msBefore);
    // Toggle off.
    st.selectToggle({ kind: "northArrow", id: "" });
    after = useHydraulicStore.getState();
    expect(after.selection).toBeNull();
    expect(after.multiSelection).toEqual(msBefore);
  });

  it("selectExtend on the singleton is idempotent and preserves multiSelection", () => {
    const st = useHydraulicStore.getState();
    st.selectExtend({ kind: "northArrow", id: "" });
    expect(useHydraulicStore.getState().selection?.kind).toBe("northArrow");
    // Re-extending = no-op (already selected). selection + multiSelection
    // unchanged. We compare the relevant fields rather than the whole
    // state object — Zustand may produce a new state wrapper even for
    // an empty patch.
    const selBefore = useHydraulicStore.getState().selection;
    const msBefore = useHydraulicStore.getState().multiSelection;
    st.selectExtend({ kind: "northArrow", id: "" });
    expect(useHydraulicStore.getState().selection).toBe(selBefore);
    expect(useHydraulicStore.getState().multiSelection).toBe(msBefore);
  });

  it("clearSelection clears the singleton too", () => {
    const st = useHydraulicStore.getState();
    st.select({ kind: "northArrow", id: "" });
    st.clearSelection();
    expect(useHydraulicStore.getState().selection).toBeNull();
  });
});

describe("Settings persistence — Phase 6.7.3", () => {
  it("northArrow defaults to undefined on a fresh project", () => {
    expect(useHydraulicStore.getState().settings.northArrow).toBeUndefined();
  });

  it("updateSettings persists position + rotation", () => {
    useHydraulicStore.getState().updateSettings({
      northArrow: { x_px: 850, y_px: 30, rotation_deg: 45 },
    });
    const na = useHydraulicStore.getState().settings.northArrow!;
    expect(na.x_px).toBe(850);
    expect(na.y_px).toBe(30);
    expect(na.rotation_deg).toBe(45);
  });

  it("reset() clears northArrow back to undefined", () => {
    useHydraulicStore.getState().updateSettings({
      northArrow: { rotation_deg: 90 },
    });
    expect(useHydraulicStore.getState().settings.northArrow).toBeDefined();
    useHydraulicStore.getState().reset();
    expect(useHydraulicStore.getState().settings.northArrow).toBeUndefined();
  });

  it("partial reset: clearing x/y while keeping rotation matches the Inspector 'Анхдагч байрлал' button", () => {
    const u = useHydraulicStore.getState().updateSettings;
    u({ northArrow: { x_px: 100, y_px: 50, rotation_deg: 30 } });
    u({
      northArrow: {
        ...(useHydraulicStore.getState().settings.northArrow ?? {}),
        x_px: undefined,
        y_px: undefined,
      },
    });
    const na = useHydraulicStore.getState().settings.northArrow!;
    expect(na.x_px).toBeUndefined();
    expect(na.y_px).toBeUndefined();
    expect(na.rotation_deg).toBe(30); // rotation preserved
  });
});

describe("Edit-without-undo discipline — Phase 6.7.3", () => {
  it("rotation_deg edits go through updateSettings WITHOUT pushing an undo snapshot (matches updateDimension pattern)", () => {
    // Engineer drags the rotation slider — many small calls.
    const u = useHydraulicStore.getState().updateSettings;
    u({ northArrow: { rotation_deg: 10 } });
    u({ northArrow: { rotation_deg: 20 } });
    u({ northArrow: { rotation_deg: 30 } });
    // No snapshots were pushed because we don't call pushUndoSnapshot
    // from inside updateSettings — same engineering choice as
    // updateDimension / updateConstructionLine / updateAnnotation.
    expect(useHydraulicStore.getState().undoStack?.length ?? 0).toBe(0);
  });

  it("explicit pushUndoSnapshot still works for explicit batch actions (sanity)", () => {
    pushUndoSnapshot("Туршилт", 1);
    expect(useHydraulicStore.getState().undoStack?.length ?? 0).toBe(1);
  });
});
