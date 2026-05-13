/**
 * Phase 6.5.2 — clipboard store-action integration tests.
 *
 * Locks down the action contract: copySelection / cutSelection /
 * pasteClipboard mutate the store + clipboard state in the expected
 * ways. The pure helpers are unit-tested in clipboard.test.ts; this
 * file covers the wire-up.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { useHydraulicStore } from "../hydraulicStore";

beforeEach(() => {
  useHydraulicStore.getState().reset();
});

function seed() {
  const st = useHydraulicStore.getState();
  st.addNode({ id: "src", kind: "source_substation", label: "Source", x: 0, y: 0 });
  st.addNode({ id: "c1", kind: "consumer_apartment", label: "C1", x: 100, y: 0, heatLoad_w: 50_000 });
  st.addNode({ id: "c2", kind: "consumer_apartment", label: "C2", x: 200, y: 0, heatLoad_w: 30_000 });
  st.addPipe({
    id: "p1", fromNodeId: "src", toNodeId: "c1",
    materialKey: "steel_new", dn: 50, length_m: 100, circuit: "heating_supply",
  });
  st.addPipe({
    id: "p2", fromNodeId: "c1", toNodeId: "c2",
    materialKey: "steel_new", dn: 40, length_m: 100, circuit: "heating_supply",
  });
}

describe("clipboard store integration — Phase 6.5.2", () => {
  it("copySelection on empty selection returns null and leaves clipboard alone", () => {
    seed();
    const result = useHydraulicStore.getState().copySelection();
    expect(result).toBeNull();
    expect(useHydraulicStore.getState().clipboard).toBeNull();
  });

  it("copySelection on multi-select populates clipboard with selected sub-network", () => {
    seed();
    const st = useHydraulicStore.getState();
    st.selectExtend({ kind: "node", id: "c1" });
    st.selectExtend({ kind: "node", id: "c2" });
    const result = st.copySelection();
    expect(result).toEqual({ nodes: 2, pipes: 1, annotations: 0 }); // c1, c2 + p2 between them
    const clip = useHydraulicStore.getState().clipboard;
    expect(clip).not.toBeNull();
    expect(clip!.nodes.map((n) => n.id).sort()).toEqual(["c1", "c2"]);
    expect(clip!.pipes[0]!.id).toBe("p2");
  });

  it("pasteClipboard with no clipboard returns null", () => {
    seed();
    const result = useHydraulicStore.getState().pasteClipboard();
    expect(result).toBeNull();
  });

  it("pasteClipboard inserts cloned objects with fresh IDs + offset", () => {
    seed();
    const st = useHydraulicStore.getState();
    st.selectExtend({ kind: "node", id: "c1" });
    st.selectExtend({ kind: "node", id: "c2" });
    st.copySelection();
    const nBefore = useHydraulicStore.getState().nodes.length;
    const pBefore = useHydraulicStore.getState().pipes.length;
    const inserted = useHydraulicStore.getState().pasteClipboard();
    expect(inserted).toEqual({ nodes: 2, pipes: 1, annotations: 0 });
    const after = useHydraulicStore.getState();
    expect(after.nodes.length).toBe(nBefore + 2);
    expect(after.pipes.length).toBe(pBefore + 1);
    // Original node IDs are still present (not mutated).
    expect(after.nodes.some((n) => n.id === "c1")).toBe(true);
    expect(after.nodes.some((n) => n.id === "c2")).toBe(true);
    // Pasted node IDs are fresh.
    const newNodes = after.nodes.filter((n) => n.id !== "src" && n.id !== "c1" && n.id !== "c2");
    expect(newNodes).toHaveLength(2);
    // Pasted positions are +20m from originals.
    const c1Original = after.nodes.find((n) => n.id === "c1")!;
    const c1Pasted = newNodes.find((n) => n.label === "C1")!;
    expect(c1Pasted.x).toBe(c1Original.x + 20);
    expect(c1Pasted.y).toBe(c1Original.y + 20);
  });

  it("paste auto-selects the newly-pasted cluster (replace prior selection)", () => {
    seed();
    const st = useHydraulicStore.getState();
    st.selectExtend({ kind: "node", id: "c1" });
    st.copySelection();
    st.pasteClipboard();
    const ms = useHydraulicStore.getState().multiSelection;
    // Pasted 1 node, no pipes (c1 alone has no intra-pipe). Selection
    // should be exactly that pasted node, not the original c1.
    expect(ms.nodeIds).toHaveLength(1);
    expect(ms.nodeIds[0]).not.toBe("c1");
  });

  it("cutSelection removes originals + populates clipboard atomically", () => {
    seed();
    const st = useHydraulicStore.getState();
    st.selectExtend({ kind: "node", id: "c1" });
    st.selectExtend({ kind: "node", id: "c2" });
    const result = st.cutSelection();
    expect(result).toEqual({ nodes: 2, pipes: 1, annotations: 0 });
    const after = useHydraulicStore.getState();
    // Originals gone; only src remains. p1 + p2 both cascade-deleted
    // because each touched a removed node.
    expect(after.nodes.map((n) => n.id)).toEqual(["src"]);
    expect(after.pipes).toEqual([]);
    // Clipboard has the cut payload.
    expect(after.clipboard).not.toBeNull();
    expect(after.clipboard!.nodes).toHaveLength(2);
    expect(after.clipboard!.pipes).toHaveLength(1);
    // Selection cleared.
    expect(after.multiSelection.nodeIds).toEqual([]);
    expect(after.multiSelection.pipeIds).toEqual([]);
  });

  it("cut → paste reproduces the deleted sub-network with fresh IDs", () => {
    seed();
    const st = useHydraulicStore.getState();
    st.selectExtend({ kind: "node", id: "c1" });
    st.selectExtend({ kind: "node", id: "c2" });
    st.cutSelection();
    const result = useHydraulicStore.getState().pasteClipboard();
    expect(result).toEqual({ nodes: 2, pipes: 1, annotations: 0 });
    const after = useHydraulicStore.getState();
    // src + 2 new pasted nodes (c1/c2 were deleted by cut, then 2 new
    // ones with shifted positions added by paste).
    expect(after.nodes).toHaveLength(3);
    expect(after.pipes).toHaveLength(1);
  });

  it("double-paste produces two independent clusters with non-colliding IDs", () => {
    seed();
    const st = useHydraulicStore.getState();
    st.selectExtend({ kind: "node", id: "c1" });
    st.copySelection();
    st.pasteClipboard();
    st.pasteClipboard();
    const after = useHydraulicStore.getState();
    // Original src + c1 + c2 + 2 pasted copies of c1 = 5
    expect(after.nodes).toHaveLength(5);
    // All IDs unique.
    expect(new Set(after.nodes.map((n) => n.id)).size).toBe(5);
  });

  it("custom paste offset flows through to inserted positions", () => {
    seed();
    const st = useHydraulicStore.getState();
    st.selectExtend({ kind: "node", id: "c1" });
    st.copySelection();
    st.pasteClipboard({ x: 200, y: -50 });
    const after = useHydraulicStore.getState();
    const orig = after.nodes.find((n) => n.id === "c1")!;
    const pasted = after.nodes.find((n) => n.id !== "src" && n.id !== "c1" && n.id !== "c2")!;
    expect(pasted.x).toBe(orig.x + 200);
    expect(pasted.y).toBe(orig.y - 50);
  });

  it("reset() clears clipboard alongside selection (blank-slate semantics)", () => {
    seed();
    const st = useHydraulicStore.getState();
    st.selectExtend({ kind: "node", id: "c1" });
    st.copySelection();
    expect(useHydraulicStore.getState().clipboard).not.toBeNull();
    st.reset();
    // Everything wiped — switching projects shouldn't leak a paste
    // from the previous session into the new one.
    expect(useHydraulicStore.getState().nodes).toEqual([]);
    expect(useHydraulicStore.getState().clipboard).toBeNull();
    expect(useHydraulicStore.getState().selection).toBeNull();
    expect(useHydraulicStore.getState().multiSelection).toEqual({ nodeIds: [], pipeIds: [], dimensionIds: [], constructionLineIds: [], annotationIds: [] });
  });
});
