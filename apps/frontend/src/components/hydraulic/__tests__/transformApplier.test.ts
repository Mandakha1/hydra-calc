/**
 * Phase 6.5 batch-ops — transformApplier integration tests.
 *
 * Math is unit-tested in scheme/__tests__/transforms.test.ts. This
 * file covers the store-bridge: read selection → run math → write
 * back via updateNode, no clones created.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  applyRotateCCW,
  applyRotateCW,
  applyRotate180,
  applyMirrorHorizontal,
  applyMirrorVertical,
  applyRotateAroundCentroid,
} from "../scheme/transformApplier";
import { useHydraulicStore } from "../hydraulicStore";

beforeEach(() => {
  useHydraulicStore.getState().reset();
});

function seedTwoNodes() {
  const st = useHydraulicStore.getState();
  st.addNode({ id: "a", kind: "consumer_apartment", label: "A", x: 0, y: 0 });
  st.addNode({ id: "b", kind: "consumer_apartment", label: "B", x: 100, y: 0 });
}

describe("applyRotateAroundCentroid — Phase 6.5", () => {
  it("returns 0 when selection is empty (no-op)", () => {
    seedTwoNodes();
    expect(applyRotateAroundCentroid(90)).toBe(0);
    // Nodes untouched.
    expect(useHydraulicStore.getState().nodes[0]!.x).toBe(0);
    expect(useHydraulicStore.getState().nodes[1]!.x).toBe(100);
  });

  it("rotates 90° CCW around centroid: 2 east-west nodes become north-south", () => {
    seedTwoNodes();
    const st = useHydraulicStore.getState();
    st.selectExtend({ kind: "node", id: "a" });
    st.selectExtend({ kind: "node", id: "b" });
    const count = applyRotateCCW();
    expect(count).toBe(2);
    // Centroid = (50, 0). After 90° CCW:
    //   A (0, 0) → (50 + 0 - 0, 0 + (-50)·1) = (50, -50) — wait,
    //   that's 50 + (0-50)·cos(90)° - (0-0)·sin(90)° = 50 + 0 - 0 = 50
    //   y = 0 + (0-50)·sin(90)° + (0-0)·cos(90)° = 0 + (-50)·1 + 0 = -50
    //   B (100, 0): 50 + (100-50)·0 - 0·1 = 50, y = 0 + 50·1 + 0 = 50
    const after = useHydraulicStore.getState();
    const aPos = after.nodes.find((n) => n.id === "a")!;
    const bPos = after.nodes.find((n) => n.id === "b")!;
    expect(aPos.x).toBe(50);
    expect(aPos.y).toBe(-50);
    expect(bPos.x).toBe(50);
    expect(bPos.y).toBe(50);
  });

  it("rotates 90° CW (-90°): same setup gives opposite signs on y", () => {
    seedTwoNodes();
    const st = useHydraulicStore.getState();
    st.selectExtend({ kind: "node", id: "a" });
    st.selectExtend({ kind: "node", id: "b" });
    applyRotateCW();
    const aPos = useHydraulicStore.getState().nodes.find((n) => n.id === "a")!;
    const bPos = useHydraulicStore.getState().nodes.find((n) => n.id === "b")!;
    expect(aPos.x).toBe(50);
    expect(aPos.y).toBe(50);
    expect(bPos.x).toBe(50);
    expect(bPos.y).toBe(-50);
  });

  it("rotates 180° flips both coordinates around centroid", () => {
    seedTwoNodes();
    const st = useHydraulicStore.getState();
    st.selectExtend({ kind: "node", id: "a" });
    st.selectExtend({ kind: "node", id: "b" });
    applyRotate180();
    const after = useHydraulicStore.getState();
    expect(after.nodes.find((n) => n.id === "a")!.x).toBe(100);
    expect(after.nodes.find((n) => n.id === "b")!.x).toBe(0);
  });

  it("preserves pipe topology after rotation (pipe from/to ids unchanged)", () => {
    seedTwoNodes();
    const st = useHydraulicStore.getState();
    st.addPipe({
      id: "p1", fromNodeId: "a", toNodeId: "b",
      materialKey: "steel_new", dn: 50, length_m: 100, circuit: "heating_supply",
    });
    st.selectExtend({ kind: "node", id: "a" });
    st.selectExtend({ kind: "node", id: "b" });
    applyRotateCCW();
    // Pipe still references a and b — only node positions changed.
    const after = useHydraulicStore.getState();
    expect(after.pipes[0]!.fromNodeId).toBe("a");
    expect(after.pipes[0]!.toNodeId).toBe("b");
    expect(after.pipes[0]!.id).toBe("p1");
  });
});

describe("applyMirrorHorizontal — Phase 6.5", () => {
  it("returns 0 when selection is empty (no-op)", () => {
    seedTwoNodes();
    expect(applyMirrorHorizontal()).toBe(0);
  });

  it("flips both nodes across centroid's Y axis", () => {
    seedTwoNodes();
    const st = useHydraulicStore.getState();
    // Move B to (0, 100) so mirror has visible effect.
    st.updateNode("b", { x: 0, y: 100 });
    st.selectExtend({ kind: "node", id: "a" });
    st.selectExtend({ kind: "node", id: "b" });
    const count = applyMirrorHorizontal();
    expect(count).toBe(2);
    // Centroid y = 50. Mirror across y=50:
    //   A at y=0 → y = 2·50 - 0 = 100
    //   B at y=100 → y = 2·50 - 100 = 0
    const after = useHydraulicStore.getState();
    expect(after.nodes.find((n) => n.id === "a")!.y).toBe(100);
    expect(after.nodes.find((n) => n.id === "b")!.y).toBe(0);
  });
});

describe("applyMirrorVertical — Phase 6.5", () => {
  it("flips both nodes across centroid's X axis", () => {
    seedTwoNodes();
    const st = useHydraulicStore.getState();
    st.selectExtend({ kind: "node", id: "a" });
    st.selectExtend({ kind: "node", id: "b" });
    const count = applyMirrorVertical();
    expect(count).toBe(2);
    // Centroid x = 50. Mirror across x=50:
    //   A at x=0 → x = 100
    //   B at x=100 → x = 0
    const after = useHydraulicStore.getState();
    expect(after.nodes.find((n) => n.id === "a")!.x).toBe(100);
    expect(after.nodes.find((n) => n.id === "b")!.x).toBe(0);
  });
});
