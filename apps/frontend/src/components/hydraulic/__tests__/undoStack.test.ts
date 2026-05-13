/**
 * Phase 6.5.5 — undo/redo coverage tests.
 *
 * What we lock down:
 *   - pushUndoSnapshot captures pre-mutation state (nodes/pipes/sel)
 *   - undo() restores the snapshot AND pushes current to redoStack
 *   - redo() restores the redo snapshot
 *   - 50-deep stack limit (FIFO eviction)
 *   - New op clears redo stack
 *   - Empty stacks return null
 *   - End-to-end: rotate → undo → original; rotate → undo → redo → rotated
 *   - End-to-end: linear array creates 50 copies; one undo removes all 50
 *   - End-to-end: cut → undo restores everything (and clipboard untouched)
 *   - Label + count propagate to undo()'s return value for toast use
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  pushUndoSnapshot,
  undo,
  redo,
  getStackDepths,
  clearUndoHistory,
  MAX_UNDO_DEPTH,
} from "../scheme/undoStack";
import { useHydraulicStore } from "../hydraulicStore";
import { applyRotateCCW } from "../scheme/transformApplier";
import { applyLinearArrayToSelection } from "../scheme/arrayApplier";

beforeEach(() => {
  useHydraulicStore.getState().reset();
});

describe("pushUndoSnapshot — Phase 6.5.5", () => {
  it("captures the current state into undoStack and clears redoStack", () => {
    const st = useHydraulicStore.getState();
    st.addNode({ id: "a", kind: "consumer_apartment", label: "A", x: 10, y: 20 });
    // Phase 6.8.1 — addNode now pushes its own "Цэг нэмсэн" snapshot.
    // Clear before testing pushUndoSnapshot's isolated behaviour.
    useHydraulicStore.setState({ undoStack: [] });
    pushUndoSnapshot("Тест", 1);
    const after = useHydraulicStore.getState();
    expect(after.undoStack).toBeDefined();
    expect(after.undoStack!.length).toBe(1);
    expect(after.undoStack![0]!.label).toBe("Тест");
    expect(after.undoStack![0]!.affectedCount).toBe(1);
    expect(after.undoStack![0]!.nodes).toHaveLength(1);
    expect(after.undoStack![0]!.nodes[0]!.id).toBe("a");
  });

  it("snapshot is a deep clone (mutating store afterward doesn't affect snap)", () => {
    const st = useHydraulicStore.getState();
    st.addNode({ id: "a", kind: "consumer_apartment", label: "A", x: 10, y: 20 });
    // Phase 6.8.1 — addNode now pushes its own "Цэг нэмсэн" snapshot.
    // Clear before testing pushUndoSnapshot's isolated behaviour.
    useHydraulicStore.setState({ undoStack: [] });
    pushUndoSnapshot("Тест", 1);
    // Mutate the original.
    st.updateNode("a", { x: 999, y: 999 });
    const snap = useHydraulicStore.getState().undoStack![0]!;
    // Snapshot's stored position is the pre-mutation (10, 20).
    expect(snap.nodes[0]!.x).toBe(10);
    expect(snap.nodes[0]!.y).toBe(20);
  });

  it("pushing > MAX_UNDO_DEPTH evicts oldest entries FIFO", () => {
    for (let i = 0; i < MAX_UNDO_DEPTH + 5; i += 1) {
      pushUndoSnapshot(`Step ${i}`, i);
    }
    const after = useHydraulicStore.getState();
    expect(after.undoStack!.length).toBe(MAX_UNDO_DEPTH);
    // First-pushed labels (Step 0..4) should be gone; latest 50 remain.
    expect(after.undoStack![0]!.label).toBe("Step 5");
    expect(after.undoStack![MAX_UNDO_DEPTH - 1]!.label).toBe(
      `Step ${MAX_UNDO_DEPTH + 4}`,
    );
  });

  it("pushing a new snapshot clears the redo stack (standard IDE semantics)", () => {
    pushUndoSnapshot("A", 1);
    undo();
    // After undo, redo stack has 1 entry.
    expect(useHydraulicStore.getState().redoStack!.length).toBe(1);
    pushUndoSnapshot("B", 1);
    // Redo cleared.
    expect(useHydraulicStore.getState().redoStack!.length).toBe(0);
  });
});

describe("undo / redo — Phase 6.5.5", () => {
  it("undo on empty stack returns null", () => {
    expect(undo()).toBeNull();
  });

  it("redo on empty stack returns null", () => {
    expect(redo()).toBeNull();
  });

  it("undo restores nodes + pipes + selection from the snapshot", () => {
    const st = useHydraulicStore.getState();
    st.addNode({ id: "a", kind: "consumer_apartment", label: "A", x: 0, y: 0 });
    useHydraulicStore.setState({ undoStack: [] });
    pushUndoSnapshot("Тест", 1);
    st.updateNode("a", { x: 100, y: 100 });
    // Snapshot the post-mutation state for assertion.
    expect(useHydraulicStore.getState().nodes[0]!.x).toBe(100);
    const r = undo();
    expect(r).toEqual({ label: "Тест", affectedCount: 1 });
    // Position back to (0, 0).
    expect(useHydraulicStore.getState().nodes[0]!.x).toBe(0);
  });

  it("undo pushes the current state to redoStack so redo can return", () => {
    const st = useHydraulicStore.getState();
    st.addNode({ id: "a", kind: "consumer_apartment", label: "A", x: 0, y: 0 });
    useHydraulicStore.setState({ undoStack: [] });
    pushUndoSnapshot("T", 1);
    st.updateNode("a", { x: 50, y: 50 });
    undo();
    expect(useHydraulicStore.getState().redoStack!.length).toBe(1);
    expect(useHydraulicStore.getState().redoStack![0]!.nodes[0]!.x).toBe(50);
  });

  it("redo restores the post-mutation state from the redo snapshot", () => {
    const st = useHydraulicStore.getState();
    st.addNode({ id: "a", kind: "consumer_apartment", label: "A", x: 0, y: 0 });
    pushUndoSnapshot("T", 1);
    st.updateNode("a", { x: 75, y: 75 });
    undo();
    // Back at (0, 0).
    expect(useHydraulicStore.getState().nodes[0]!.x).toBe(0);
    const r = redo();
    expect(r).toEqual({ label: "T", affectedCount: 1 });
    expect(useHydraulicStore.getState().nodes[0]!.x).toBe(75);
  });

  it("multi-step undo walks back through the stack", () => {
    const st = useHydraulicStore.getState();
    st.addNode({ id: "a", kind: "consumer_apartment", label: "A", x: 0, y: 0 });
    useHydraulicStore.setState({ undoStack: [] });
    pushUndoSnapshot("Step 1", 1);
    st.updateNode("a", { x: 10, y: 0 });
    pushUndoSnapshot("Step 2", 1);
    st.updateNode("a", { x: 20, y: 0 });
    pushUndoSnapshot("Step 3", 1);
    st.updateNode("a", { x: 30, y: 0 });

    expect(useHydraulicStore.getState().nodes[0]!.x).toBe(30);
    undo(); // back to 20
    expect(useHydraulicStore.getState().nodes[0]!.x).toBe(20);
    undo(); // back to 10
    expect(useHydraulicStore.getState().nodes[0]!.x).toBe(10);
    undo(); // back to 0
    expect(useHydraulicStore.getState().nodes[0]!.x).toBe(0);
    expect(undo()).toBeNull(); // exhausted
  });
});

describe("End-to-end undo on appliers — Phase 6.5.5", () => {
  it("rotate → undo → original positions restored", () => {
    const st = useHydraulicStore.getState();
    st.addNode({ id: "a", kind: "consumer_apartment", label: "A", x: 0, y: 0 });
    st.addNode({ id: "b", kind: "consumer_apartment", label: "B", x: 100, y: 0 });
    st.selectExtend({ kind: "node", id: "a" });
    st.selectExtend({ kind: "node", id: "b" });
    applyRotateCCW();
    // After rotate, A and B should be at (50, ±50).
    const rotated = useHydraulicStore.getState().nodes;
    expect(rotated.find((n) => n.id === "a")!.y).toBe(-50);
    const r = undo();
    expect(r?.label).toContain("Эргүүлэлт");
    expect(r?.affectedCount).toBe(2);
    // Positions restored.
    const after = useHydraulicStore.getState().nodes;
    expect(after.find((n) => n.id === "a")!.x).toBe(0);
    expect(after.find((n) => n.id === "a")!.y).toBe(0);
    expect(after.find((n) => n.id === "b")!.x).toBe(100);
  });

  it("linear array of 50 copies → one undo removes all 50", () => {
    const st = useHydraulicStore.getState();
    st.addNode({ id: "a", kind: "consumer_apartment", label: "A", x: 0, y: 0 });
    st.selectExtend({ kind: "node", id: "a" });
    // 1×50 array = 49 new nodes (49 copies + original).
    applyLinearArrayToSelection({
      rows: 1, cols: 50, rowSpacing_m: 10, colSpacing_m: 10, direction: "Right-Down",
    });
    expect(useHydraulicStore.getState().nodes.length).toBe(50);
    const r = undo();
    expect(r?.label).toContain("Шугаман массив");
    // All 49 copies gone in one shot.
    expect(useHydraulicStore.getState().nodes.length).toBe(1);
  });

  it("cut → undo restores deleted nodes + pipes (clipboard preserved)", () => {
    const st = useHydraulicStore.getState();
    st.addNode({ id: "a", kind: "consumer_apartment", label: "A", x: 0, y: 0 });
    st.addNode({ id: "b", kind: "consumer_apartment", label: "B", x: 100, y: 0 });
    st.addPipe({
      id: "p1", fromNodeId: "a", toNodeId: "b",
      materialKey: "steel_new", dn: 50, length_m: 100, circuit: "heating_supply",
    });
    st.selectExtend({ kind: "node", id: "a" });
    st.selectExtend({ kind: "node", id: "b" });
    st.cutSelection();
    // After cut: store empty, clipboard has the payload.
    expect(useHydraulicStore.getState().nodes).toEqual([]);
    expect(useHydraulicStore.getState().pipes).toEqual([]);
    expect(useHydraulicStore.getState().clipboard).not.toBeNull();
    const r = undo();
    expect(r?.label).toContain("Бөгөмөөр зүссэн");
    // Originals restored.
    expect(useHydraulicStore.getState().nodes).toHaveLength(2);
    expect(useHydraulicStore.getState().pipes).toHaveLength(1);
    // Clipboard untouched by undo (still has the cut payload — engineer
    // can still paste even after undoing the cut).
    expect(useHydraulicStore.getState().clipboard).not.toBeNull();
  });

  it("rotate → undo → redo gets the rotated state back", () => {
    const st = useHydraulicStore.getState();
    st.addNode({ id: "a", kind: "consumer_apartment", label: "A", x: 0, y: 0 });
    st.addNode({ id: "b", kind: "consumer_apartment", label: "B", x: 100, y: 0 });
    st.selectExtend({ kind: "node", id: "a" });
    st.selectExtend({ kind: "node", id: "b" });
    applyRotateCCW();
    undo();
    expect(useHydraulicStore.getState().nodes.find((n) => n.id === "a")!.y).toBe(0);
    redo();
    expect(useHydraulicStore.getState().nodes.find((n) => n.id === "a")!.y).toBe(-50);
  });
});

describe("Diagnostics — Phase 6.5.5", () => {
  it("getStackDepths reports {undo, redo} counts", () => {
    expect(getStackDepths()).toEqual({ undo: 0, redo: 0 });
    pushUndoSnapshot("A", 1);
    pushUndoSnapshot("B", 1);
    expect(getStackDepths()).toEqual({ undo: 2, redo: 0 });
    undo();
    expect(getStackDepths()).toEqual({ undo: 1, redo: 1 });
  });

  it("clearUndoHistory empties both stacks", () => {
    pushUndoSnapshot("A", 1);
    undo();
    clearUndoHistory();
    expect(getStackDepths()).toEqual({ undo: 0, redo: 0 });
  });
});
