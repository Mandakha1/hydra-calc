/**
 * Phase 6.8.1 — integration tests reproducing the three CRITICAL UX
 * bugs from the production bug bash.
 *
 * Discipline: integration-test FIRST. Each `it()` reproduces a
 * user-visible failure mode and asserts the user-visible recovery.
 * Unit tests on individual functions (pushUndoSnapshot, copySelection
 * etc.) already exist and pass — yet the production flows are broken
 * because the wiring between user action → store action → undo /
 * clipboard / pipe-mode never had a regression pin.
 *
 * Tests are paired:
 *   1. "(reproduces bug)" — asserts the broken behaviour we observed.
 *   2. "(fix expected)" — asserts the engineer-visible recovery
 *       once the fix lands. Initially failing; passes after the fix
 *       in this same PR.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { useHydraulicStore } from "../hydraulicStore";
import { undo, redo, pushUndoSnapshot } from "../scheme/undoStack";
import type { SchemeNode, SchemePipe } from "../hydraulicTypes";

beforeEach(() => {
  useHydraulicStore.getState().reset();
});

function makeNode(id: string, x: number = 0, y: number = 0): SchemeNode {
  return { id, kind: "consumer_apartment", label: id, x, y };
}

function makePipe(id: string, fromId: string, toId: string): SchemePipe {
  return {
    id,
    fromNodeId: fromId,
    toNodeId: toId,
    materialKey: "steel_aged",
    dn: 50,
    length_m: 10,
    circuit: "heating_supply",
  };
}

/* ─── BUG #3 — Undo for node placement broken ───────────────────── */

describe("BUG #3 — undo for node placement (Phase 6.8.1)", () => {
  it("addNode pushes an undo snapshot (so Ctrl+Z works on placement)", () => {
    const st = useHydraulicStore.getState();
    expect(useHydraulicStore.getState().undoStack?.length ?? 0).toBe(0);
    st.addNode(makeNode("n1"));
    // PRE-FIX: undoStack stays empty because addNode lacks pushUndoSnapshot.
    // POST-FIX: snapshot pushed before mutation → length === 1.
    expect(useHydraulicStore.getState().undoStack?.length ?? 0).toBeGreaterThanOrEqual(1);
  });

  it("Ctrl+Z after addNode restores empty nodes array", () => {
    const st = useHydraulicStore.getState();
    st.addNode(makeNode("n1"));
    expect(useHydraulicStore.getState().nodes).toHaveLength(1);
    const result = undo();
    expect(result).not.toBeNull();
    expect(useHydraulicStore.getState().nodes).toHaveLength(0);
  });

  it("Ctrl+Y after undo re-applies the addNode", () => {
    const st = useHydraulicStore.getState();
    st.addNode(makeNode("n1", 100, 200));
    undo();
    expect(useHydraulicStore.getState().nodes).toHaveLength(0);
    redo();
    const nodes = useHydraulicStore.getState().nodes;
    expect(nodes).toHaveLength(1);
    expect(nodes[0]!.id).toBe("n1");
    expect(nodes[0]!.x).toBe(100);
  });

  it("addPipe pushes an undo snapshot", () => {
    const st = useHydraulicStore.getState();
    st.addNode(makeNode("a"));
    st.addNode(makeNode("b", 100));
    const before = useHydraulicStore.getState().undoStack?.length ?? 0;
    st.addPipe(makePipe("p1", "a", "b"));
    const after = useHydraulicStore.getState().undoStack?.length ?? 0;
    expect(after).toBeGreaterThan(before);
  });

  it("removeNode is reversible via the SchemeEditor Del-handler push (caller-pushed pattern)", () => {
    const st = useHydraulicStore.getState();
    st.addNode(makeNode("n1"));
    // Simulate what the SchemeEditor Del handler does: caller pushes
    // ONE snapshot before invoking removeNode (or before a batched
    // cascade of removeNode/removePipe calls). The store actions
    // themselves don't push — that would explode the snapshot count
    // for batch operations like cutSelection.
    useHydraulicStore.setState({ undoStack: [] });
    pushUndoSnapshot("Устгасан", 1);
    st.removeNode("n1");
    expect(useHydraulicStore.getState().nodes).toHaveLength(0);
    undo();
    expect(useHydraulicStore.getState().nodes).toHaveLength(1);
  });

  it("five consecutive addNode operations stack five undo entries", () => {
    const st = useHydraulicStore.getState();
    for (let i = 0; i < 5; i += 1) {
      st.addNode(makeNode(`n${i}`, i * 10));
    }
    expect(useHydraulicStore.getState().nodes).toHaveLength(5);
    expect(useHydraulicStore.getState().undoStack?.length ?? 0).toBeGreaterThanOrEqual(5);
    // Each Ctrl+Z peels one node off.
    undo();
    expect(useHydraulicStore.getState().nodes).toHaveLength(4);
    undo();
    expect(useHydraulicStore.getState().nodes).toHaveLength(3);
  });

  it("updateNode is reversible via caller-pushed drag snapshot", () => {
    // Phase 6.8.1 deliberately does NOT push from updateNode (would
    // explode the snapshot count during transform applier batches +
    // drag mousemoves). Drag-start handler in SchemeEditor pushes
    // ONE snapshot before the sequence of updateNode calls. This
    // test simulates that contract.
    const st = useHydraulicStore.getState();
    st.addNode(makeNode("n1", 0, 0));
    useHydraulicStore.setState({ undoStack: [] });
    // Caller (drag-start) pushes:
    pushUndoSnapshot("Зангилаа зөөв", 1);
    // ... multiple updateNode calls during drag (each silent) ...
    st.updateNode("n1", { x: 100, y: 50 });
    st.updateNode("n1", { x: 500, y: 250 });
    st.updateNode("n1", { x: 999, y: 999 });
    expect(useHydraulicStore.getState().undoStack?.length ?? 0).toBe(1);
    undo();
    const n = useHydraulicStore.getState().nodes[0]!;
    expect(n.x).toBe(0);
    expect(n.y).toBe(0);
  });
});

/* ─── BUG #5 — Clipboard Ctrl+C/V state flow ─────────────────────── */

describe("BUG #5 — clipboard Ctrl+C/V state flow (Phase 6.8.1)", () => {
  it("multi-selected Ctrl+C populates store.clipboard (no UI — pure state)", () => {
    const st = useHydraulicStore.getState();
    st.addNode(makeNode("a"));
    st.addNode(makeNode("b", 100));
    st.selectMany({ nodeIds: ["a", "b"], pipeIds: [] });
    const r = st.copySelection();
    expect(r).not.toBeNull();
    expect(r!.nodes).toBe(2);
    const clipboard = useHydraulicStore.getState().clipboard;
    expect(clipboard).not.toBeNull();
    expect(clipboard!.nodes).toHaveLength(2);
  });

  it("Ctrl+C with EMPTY selection returns null (UI should toast clearly)", () => {
    const st = useHydraulicStore.getState();
    // No selection at all.
    expect(st.multiSelection.nodeIds).toEqual([]);
    const r = st.copySelection();
    expect(r).toBeNull();
    // This is the production failure mode: the Ctrl+C handler used
    // to silently swallow the null and the engineer saw no toast.
    // Phase 6.8.1 fix: the handler shows an "empty selection" toast
    // (verified at the UI layer separately).
  });

  it("Ctrl+V with populated clipboard inserts pasted entities", () => {
    const st = useHydraulicStore.getState();
    st.addNode(makeNode("a", 0, 0));
    st.addNode(makeNode("b", 100, 0));
    st.selectMany({ nodeIds: ["a", "b"], pipeIds: [] });
    st.copySelection();
    const before = useHydraulicStore.getState().nodes.length;
    const r = st.pasteClipboard();
    expect(r).not.toBeNull();
    expect(r!.nodes).toBe(2);
    expect(useHydraulicStore.getState().nodes.length).toBe(before + 2);
  });

  it("pasted nodes have fresh IDs (no collision with originals)", () => {
    const st = useHydraulicStore.getState();
    st.addNode(makeNode("a"));
    st.selectMany({ nodeIds: ["a"], pipeIds: [] });
    st.copySelection();
    st.pasteClipboard();
    const ids = useHydraulicStore.getState().nodes.map((n) => n.id);
    // Original + 1 paste = 2 nodes total, all distinct ids.
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(2);
  });

  it("intra-selection pipe is preserved on copy + paste", () => {
    const st = useHydraulicStore.getState();
    st.addNode(makeNode("a", 0, 0));
    st.addNode(makeNode("b", 100, 0));
    st.addPipe(makePipe("p1", "a", "b"));
    st.selectMany({ nodeIds: ["a", "b"], pipeIds: ["p1"] });
    st.copySelection();
    st.pasteClipboard();
    // Originals + paste = 4 nodes + 2 pipes (the pasted pipe rewires
    // to the pasted endpoints).
    expect(useHydraulicStore.getState().nodes).toHaveLength(4);
    expect(useHydraulicStore.getState().pipes).toHaveLength(2);
  });

  it("Ctrl+X (cut) removes originals AND keeps clipboard alive for paste", () => {
    const st = useHydraulicStore.getState();
    st.addNode(makeNode("a"));
    st.selectMany({ nodeIds: ["a"], pipeIds: [] });
    const r = st.cutSelection();
    expect(r!.nodes).toBe(1);
    expect(useHydraulicStore.getState().nodes).toHaveLength(0);
    expect(useHydraulicStore.getState().clipboard).not.toBeNull();
    // Paste re-inserts.
    st.pasteClipboard();
    expect(useHydraulicStore.getState().nodes).toHaveLength(1);
  });
});

/* ─── BUG #1 — Pipe-mode state transition (store-level) ─────────── */

describe("BUG #1 — pipe-mode state flow (Phase 6.8.1)", () => {
  // We can't easily simulate Leaflet event interception in jsdom, so
  // these tests cover the addPipe state flow that the SchemeEditor's
  // pipe-mode handler invokes. The defensive UI fix (explicit
  // pointer-events on node SVG groups + crosshair cursor in pipe
  // mode) is verified manually in the PR body.

  it("addPipe creates a pipe linking two existing nodes", () => {
    const st = useHydraulicStore.getState();
    st.addNode(makeNode("a", 0, 0));
    st.addNode(makeNode("b", 100, 0));
    st.addPipe(makePipe("p1", "a", "b"));
    const pipes = useHydraulicStore.getState().pipes;
    expect(pipes).toHaveLength(1);
    expect(pipes[0]!.fromNodeId).toBe("a");
    expect(pipes[0]!.toNodeId).toBe("b");
  });

  it("addPipe before either endpoint exists is recoverable via undo", () => {
    // Defensive — addPipe with dangling refs SHOULD be undoable so
    // a misclick in pipe mode doesn't permanently corrupt state.
    const st = useHydraulicStore.getState();
    st.addPipe(makePipe("dangling", "ghost-a", "ghost-b"));
    expect(useHydraulicStore.getState().pipes).toHaveLength(1);
    undo();
    expect(useHydraulicStore.getState().pipes).toHaveLength(0);
  });

  it("removePipe is reversible via caller-pushed snapshot", () => {
    const st = useHydraulicStore.getState();
    st.addNode(makeNode("a"));
    st.addNode(makeNode("b", 100));
    st.addPipe(makePipe("p1", "a", "b"));
    useHydraulicStore.setState({ undoStack: [] });
    pushUndoSnapshot("Хоолой устгасан", 1);
    st.removePipe("p1");
    expect(useHydraulicStore.getState().pipes).toHaveLength(0);
    undo();
    expect(useHydraulicStore.getState().pipes).toHaveLength(1);
  });
});
