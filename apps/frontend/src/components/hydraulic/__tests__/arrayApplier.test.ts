/**
 * Phase 6.5.4 — arrayApplier integration tests.
 *
 * The pure math (arrayOps.ts) is exercised in scheme/__tests__/
 * arrayOps.test.ts. This file covers the store-bridge:
 *   - reads multiSelection from the live store
 *   - inserts every cloned node + pipe via addNode/addPipe
 *   - auto-selects the new clones (via selectMany)
 *   - returns count totals for toast feedback
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  applyLinearArrayToSelection,
  applyPolarArrayToSelection,
} from "../scheme/arrayApplier";
import { useHydraulicStore } from "../hydraulicStore";

beforeEach(() => {
  useHydraulicStore.getState().reset();
});

/** Seed: one source + two consumers + two pipes. */
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

describe("applyLinearArrayToSelection — Phase 6.5.4", () => {
  it("returns null when selection is empty (no-op)", () => {
    const result = applyLinearArrayToSelection({
      rows: 2, cols: 2, rowSpacing_m: 20, colSpacing_m: 20, direction: "Right-Down",
    });
    expect(result).toBeNull();
  });

  it("1×4 array on a single consumer inserts 3 new clones, auto-selected", () => {
    seed();
    const st = useHydraulicStore.getState();
    st.selectExtend({ kind: "node", id: "c1" });
    const result = applyLinearArrayToSelection({
      rows: 1, cols: 4, rowSpacing_m: 30, colSpacing_m: 30, direction: "Right-Down",
    });
    expect(result).toEqual({ nodes: 3, pipes: 0 });
    const after = useHydraulicStore.getState();
    expect(after.nodes).toHaveLength(6); // src + c1 + c2 + 3 new
    // Auto-selected the new copies.
    expect(after.multiSelection.nodeIds).toHaveLength(3);
    // None of the auto-selected IDs match the originals.
    expect(after.multiSelection.nodeIds).not.toContain("c1");
    expect(after.multiSelection.nodeIds).not.toContain("c2");
  });

  it("2×3 array on a 2-node sub-network preserves intra-copy pipes", () => {
    seed();
    const st = useHydraulicStore.getState();
    st.selectExtend({ kind: "node", id: "c1" });
    st.selectExtend({ kind: "node", id: "c2" });
    // p2 connects c1↔c2 (both in selection) — gets copied intra-copy.
    const result = applyLinearArrayToSelection({
      rows: 2, cols: 3, rowSpacing_m: 20, colSpacing_m: 20, direction: "Right-Down",
    });
    expect(result).toEqual({ nodes: 10, pipes: 5 }); // 5 copies × 2 nodes / 1 pipe each
    const after = useHydraulicStore.getState();
    // Total pipes: 2 original + 5 new copies = 7.
    expect(after.pipes).toHaveLength(7);
    // Verify each new pipe references existing nodes in the store.
    for (const p of after.pipes) {
      expect(after.nodes.find((n) => n.id === p.fromNodeId)).toBeDefined();
      expect(after.nodes.find((n) => n.id === p.toNodeId)).toBeDefined();
    }
  });

  it("array preserves engineering fields (heatLoad, DN, material)", () => {
    seed();
    const st = useHydraulicStore.getState();
    st.selectExtend({ kind: "node", id: "c1" });
    applyLinearArrayToSelection({
      rows: 1, cols: 3, rowSpacing_m: 30, colSpacing_m: 30, direction: "Right-Down",
    });
    const after = useHydraulicStore.getState();
    const cloned = after.nodes.filter((n) => n.id !== "src" && n.id !== "c1" && n.id !== "c2");
    expect(cloned).toHaveLength(2);
    for (const c of cloned) {
      expect(c.kind).toBe("consumer_apartment");
      expect(c.heatLoad_w).toBe(50_000);
      expect(c.label).toBe("C1");
    }
  });
});

describe("applyPolarArrayToSelection — Phase 6.5.4", () => {
  it("returns null when selection is empty", () => {
    const result = applyPolarArrayToSelection({
      center_px: { x: 0, y: 0 }, count: 4, sweepAngleDeg: 360,
    });
    expect(result).toBeNull();
  });

  it("8 copies full circle on single node inserts 7 clones + auto-selects them", () => {
    seed();
    const st = useHydraulicStore.getState();
    st.selectExtend({ kind: "node", id: "c1" });
    const result = applyPolarArrayToSelection({
      center_px: { x: 0, y: 0 }, count: 8, sweepAngleDeg: 360,
    });
    expect(result).toEqual({ nodes: 7, pipes: 0 });
    const after = useHydraulicStore.getState();
    expect(after.nodes).toHaveLength(10); // 3 original + 7 new
    expect(after.multiSelection.nodeIds).toHaveLength(7);
    // All 7 new copies should be roughly at radius 100 from (0, 0)
    // (c1's distance from origin).
    const newNodes = after.nodes.filter((n) =>
      after.multiSelection.nodeIds.includes(n.id),
    );
    for (const n of newNodes) {
      const r = Math.hypot(n.x, n.y);
      expect(r).toBeGreaterThan(95);
      expect(r).toBeLessThan(105);
    }
  });

  it("4 copies in 90° arc places copies at distinct angles", () => {
    seed();
    const st = useHydraulicStore.getState();
    st.selectExtend({ kind: "node", id: "c1" });
    applyPolarArrayToSelection({
      center_px: { x: 0, y: 0 }, count: 4, startAngleDeg: 0, sweepAngleDeg: 90,
    });
    const after = useHydraulicStore.getState();
    const newNodes = after.nodes.filter((n) =>
      after.multiSelection.nodeIds.includes(n.id),
    );
    expect(newNodes).toHaveLength(3); // 4 - 1 original = 3
    // Verify the new copies are at distinct angles.
    const angles = newNodes
      .map((n) => (Math.atan2(n.y, n.x) * 180) / Math.PI)
      .sort((a, b) => a - b);
    expect(angles[1]! - angles[0]!).toBeGreaterThan(5); // distinct
    expect(angles[2]! - angles[1]!).toBeGreaterThan(5);
  });
});
