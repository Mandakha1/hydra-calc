/**
 * Phase 6.5.1 — Multi-selection store contract tests.
 *
 * What we lock down:
 *   - select(target) sets BOTH legacy `selection` and multiSelection
 *     (single-click — replace all)
 *   - selectToggle adds/removes from multiSelection, legacy `selection`
 *     follows last-clicked
 *   - selectExtend adds without toggling (idempotent on re-add)
 *   - selectMany replaces multiSelection with a set; legacy gets first
 *   - clearSelection wipes both
 *   - removeNode / removePipe scrub orphaned IDs from multiSelection
 *     (no dangling references after cascade-delete)
 */
import { describe, it, expect, beforeEach } from "vitest";
import { useHydraulicStore } from "../hydraulicStore";

beforeEach(() => {
  useHydraulicStore.getState().reset();
});

describe("Multi-selection — Phase 6.5.1 store contract", () => {
  it("starts empty (fresh state)", () => {
    const s = useHydraulicStore.getState();
    expect(s.selection).toBeNull();
    expect(s.multiSelection).toEqual({ nodeIds: [], pipeIds: [], dimensionIds: [], constructionLineIds: [] });
  });

  it("select(single) sets both legacy and multiSelection to that target", () => {
    useHydraulicStore.getState().select({ kind: "node", id: "n1" });
    const s = useHydraulicStore.getState();
    expect(s.selection).toEqual({ kind: "node", id: "n1" });
    expect(s.multiSelection).toEqual({ nodeIds: ["n1"], pipeIds: [], dimensionIds: [], constructionLineIds: [] });

    // Pipe variant.
    useHydraulicStore.getState().select({ kind: "pipe", id: "p1" });
    const s2 = useHydraulicStore.getState();
    expect(s2.selection).toEqual({ kind: "pipe", id: "p1" });
    expect(s2.multiSelection).toEqual({ nodeIds: [], pipeIds: ["p1"], dimensionIds: [], constructionLineIds: [] });
  });

  it("select(null) clears both", () => {
    useHydraulicStore.getState().select({ kind: "node", id: "n1" });
    useHydraulicStore.getState().select(null);
    const s = useHydraulicStore.getState();
    expect(s.selection).toBeNull();
    expect(s.multiSelection).toEqual({ nodeIds: [], pipeIds: [], dimensionIds: [], constructionLineIds: [] });
  });

  it("selectToggle adds a new target then removes on second toggle", () => {
    useHydraulicStore.getState().selectToggle({ kind: "node", id: "n1" });
    expect(useHydraulicStore.getState().multiSelection.nodeIds).toEqual(["n1"]);
    expect(useHydraulicStore.getState().selection).toEqual({ kind: "node", id: "n1" });

    // Toggle off — only one in set, so selection goes null.
    useHydraulicStore.getState().selectToggle({ kind: "node", id: "n1" });
    expect(useHydraulicStore.getState().multiSelection.nodeIds).toEqual([]);
    expect(useHydraulicStore.getState().selection).toBeNull();
  });

  it("selectToggle on a 2-item selection drops the toggled one, falls back legacy to other", () => {
    useHydraulicStore.getState().selectToggle({ kind: "node", id: "n1" });
    useHydraulicStore.getState().selectExtend({ kind: "node", id: "n2" });
    // multiSelection now [n1, n2]; legacy = n2 (extend updated it).
    useHydraulicStore.getState().selectToggle({ kind: "node", id: "n2" });
    const s = useHydraulicStore.getState();
    expect(s.multiSelection.nodeIds).toEqual(["n1"]);
    // Legacy fell back to the remaining node n1.
    expect(s.selection).toEqual({ kind: "node", id: "n1" });
  });

  it("selectExtend is idempotent on re-add (no duplicates)", () => {
    useHydraulicStore.getState().selectExtend({ kind: "node", id: "n1" });
    useHydraulicStore.getState().selectExtend({ kind: "node", id: "n1" });
    useHydraulicStore.getState().selectExtend({ kind: "node", id: "n1" });
    expect(useHydraulicStore.getState().multiSelection.nodeIds).toEqual(["n1"]);
  });

  it("selectExtend mixes node and pipe ids correctly", () => {
    useHydraulicStore.getState().selectExtend({ kind: "node", id: "n1" });
    useHydraulicStore.getState().selectExtend({ kind: "pipe", id: "p1" });
    useHydraulicStore.getState().selectExtend({ kind: "node", id: "n2" });
    const s = useHydraulicStore.getState();
    expect(s.multiSelection.nodeIds).toEqual(["n1", "n2"]);
    expect(s.multiSelection.pipeIds).toEqual(["p1"]);
    // Last extend updated legacy to n2.
    expect(s.selection).toEqual({ kind: "node", id: "n2" });
  });

  it("selectMany replaces the entire multiSelection (rubber-band drop semantics)", () => {
    useHydraulicStore.getState().selectExtend({ kind: "node", id: "n1" });
    useHydraulicStore.getState().selectMany({
      nodeIds: ["a", "b", "c"],
      pipeIds: ["p1", "p2"],
    });
    const s = useHydraulicStore.getState();
    expect(s.multiSelection.nodeIds).toEqual(["a", "b", "c"]);
    expect(s.multiSelection.pipeIds).toEqual(["p1", "p2"]);
    // Legacy = first node (so InspectorPanel renders something useful).
    expect(s.selection).toEqual({ kind: "node", id: "a" });
  });

  it("selectMany with only pipes — legacy falls back to first pipe", () => {
    useHydraulicStore.getState().selectMany({
      nodeIds: [],
      pipeIds: ["p1", "p2"],
    });
    expect(useHydraulicStore.getState().selection).toEqual({ kind: "pipe", id: "p1" });
  });

  it("clearSelection wipes both legacy and multiSelection", () => {
    useHydraulicStore.getState().selectExtend({ kind: "node", id: "n1" });
    useHydraulicStore.getState().selectExtend({ kind: "pipe", id: "p1" });
    useHydraulicStore.getState().clearSelection();
    const s = useHydraulicStore.getState();
    expect(s.selection).toBeNull();
    expect(s.multiSelection).toEqual({ nodeIds: [], pipeIds: [], dimensionIds: [], constructionLineIds: [] });
  });

  it("removeNode scrubs the removed node from multiSelection.nodeIds", () => {
    // Set up minimum state — a node + a pipe touching it.
    useHydraulicStore.getState().addNode({
      id: "n1", kind: "consumer_apartment", label: "Test", x: 0, y: 0,
    });
    useHydraulicStore.getState().addNode({
      id: "n2", kind: "consumer_apartment", label: "Test 2", x: 50, y: 0,
    });
    useHydraulicStore.getState().selectExtend({ kind: "node", id: "n1" });
    useHydraulicStore.getState().selectExtend({ kind: "node", id: "n2" });
    expect(useHydraulicStore.getState().multiSelection.nodeIds).toEqual(["n1", "n2"]);

    useHydraulicStore.getState().removeNode("n1");
    expect(useHydraulicStore.getState().multiSelection.nodeIds).toEqual(["n2"]);
  });

  it("removeNode cascades: pipes touching it are removed AND scrubbed from selection", () => {
    useHydraulicStore.getState().addNode({
      id: "n1", kind: "source_substation", label: "S", x: 0, y: 0,
    });
    useHydraulicStore.getState().addNode({
      id: "n2", kind: "consumer_apartment", label: "C", x: 50, y: 0,
    });
    useHydraulicStore.getState().addPipe({
      id: "p1", fromNodeId: "n1", toNodeId: "n2",
      materialKey: "steel_new", dn: 50, length_m: 50, circuit: "heating_supply",
    });
    useHydraulicStore.getState().selectExtend({ kind: "pipe", id: "p1" });
    expect(useHydraulicStore.getState().multiSelection.pipeIds).toEqual(["p1"]);

    useHydraulicStore.getState().removeNode("n1");
    // p1 is gone (cascade) AND scrubbed from multiSelection.
    expect(useHydraulicStore.getState().pipes).toEqual([]);
    expect(useHydraulicStore.getState().multiSelection.pipeIds).toEqual([]);
  });

  it("removePipe scrubs the removed pipe from multiSelection.pipeIds", () => {
    useHydraulicStore.getState().addNode({
      id: "n1", kind: "consumer_apartment", label: "C", x: 0, y: 0,
    });
    useHydraulicStore.getState().addNode({
      id: "n2", kind: "consumer_apartment", label: "C2", x: 50, y: 0,
    });
    useHydraulicStore.getState().addPipe({
      id: "p1", fromNodeId: "n1", toNodeId: "n2",
      materialKey: "steel_new", dn: 50, length_m: 50, circuit: "heating_supply",
    });
    useHydraulicStore.getState().selectExtend({ kind: "pipe", id: "p1" });
    useHydraulicStore.getState().removePipe("p1");
    expect(useHydraulicStore.getState().multiSelection.pipeIds).toEqual([]);
  });

  it("reset() clears multiSelection back to empty", () => {
    useHydraulicStore.getState().selectExtend({ kind: "node", id: "n1" });
    useHydraulicStore.getState().selectExtend({ kind: "pipe", id: "p1" });
    useHydraulicStore.getState().reset();
    expect(useHydraulicStore.getState().multiSelection).toEqual({
      nodeIds: [], pipeIds: [], dimensionIds: [], constructionLineIds: [],
    });
    expect(useHydraulicStore.getState().selection).toBeNull();
  });
});
