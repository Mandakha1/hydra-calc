/**
 * Phase 12.4 — Integration test: building right-click tag-as flow.
 *
 * Asserts that the buildTagAsParams + store actions produce the
 * expected atomic state change (node added at centroid, building
 * patched with taggedAsKind + taggedAsNodeId pointing at the new
 * node). Tests the data flow that the SchemeEditor context menu
 * wires up.
 *
 * The SchemeEditor SVG render path (right-click → menu opens →
 * submenu → click kind) is exercised via Phase 12.1 outlineTag unit
 * tests + the SchemeEditor browser smoke (manual verification).
 * Here we focus on the integration contract.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { useHydraulicStore } from "../hydraulicStore";
import { buildTagAsParams, TAG_AS_KIND_OPTIONS } from "../scheme/outlineTag";
import type { SchemeBuilding } from "../hydraulicTypes";

function squareBuilding(id: string): SchemeBuilding {
  return {
    id,
    polygon: [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ],
    label: "",
  };
}

beforeEach(() => {
  useHydraulicStore.getState().reset();
});

describe("Building tag-as integration — Phase 12.4", () => {
  it("creates a node at building centroid + patches building.taggedAsNodeId", () => {
    // Seed: one building, no nodes
    useHydraulicStore.setState({ buildings: [squareBuilding("b1")] });

    const store = useHydraulicStore.getState();
    const building = store.buildings![0]!;
    const { node, buildingPatch } = buildTagAsParams(
      building,
      "consumer_apartment",
      store.nodes,
    );

    // Apply atomically (mirrors SchemeEditor's onTagAs handler)
    store.addNode(node);
    useHydraulicStore.setState((s) => ({
      buildings: (s.buildings ?? []).map((b) =>
        b.id === "b1" ? { ...b, ...buildingPatch } : b,
      ),
    }));

    const after = useHydraulicStore.getState();
    expect(after.nodes).toHaveLength(1);
    expect(after.nodes[0]!.x).toBeCloseTo(50, 1);
    expect(after.nodes[0]!.y).toBeCloseTo(50, 1);
    expect(after.nodes[0]!.label).toBe("АОС-1");
    expect(after.nodes[0]!.kind).toBe("consumer_apartment");
    expect(after.buildings![0]!.taggedAsKind).toBe("consumer_apartment");
    expect(after.buildings![0]!.taggedAsNodeId).toBe(node.id);
    expect(after.buildings![0]!.label).toBe("АОС-1");
  });

  it("sequential tagging produces АОС-1, АОС-2, ... per Phase 12.1 convention", () => {
    useHydraulicStore.setState({
      buildings: [
        squareBuilding("b1"),
        { ...squareBuilding("b2"), polygon: [
          { x: 200, y: 0 }, { x: 300, y: 0 }, { x: 300, y: 100 }, { x: 200, y: 100 },
        ] },
      ],
    });
    const apply = (id: string, kind: string) => {
      const store = useHydraulicStore.getState();
      const b = store.buildings!.find((bb) => bb.id === id)!;
      const { node, buildingPatch } = buildTagAsParams(b, kind, store.nodes);
      store.addNode(node);
      useHydraulicStore.setState((s) => ({
        buildings: (s.buildings ?? []).map((bb) =>
          bb.id === id ? { ...bb, ...buildingPatch } : bb,
        ),
      }));
    };
    apply("b1", "consumer_apartment");
    apply("b2", "consumer_apartment");

    const labels = useHydraulicStore.getState().nodes.map((n) => n.label);
    expect(labels).toEqual(["АОС-1", "АОС-2"]);
  });

  it("untag removes the auto-created node + clears taggedAsKind", () => {
    useHydraulicStore.setState({ buildings: [squareBuilding("b1")] });
    const store = useHydraulicStore.getState();
    const b = store.buildings![0]!;
    const { node, buildingPatch } = buildTagAsParams(b, "well_supply", store.nodes);
    store.addNode(node);
    useHydraulicStore.setState((s) => ({
      buildings: (s.buildings ?? []).map((bb) =>
        bb.id === "b1" ? { ...bb, ...buildingPatch } : bb,
      ),
    }));
    // Verify tagged
    expect(useHydraulicStore.getState().nodes).toHaveLength(1);
    expect(useHydraulicStore.getState().buildings![0]!.taggedAsKind).toBe("well_supply");

    // Untag: remove the node + clear fields
    const taggedNodeId = useHydraulicStore.getState().buildings![0]!.taggedAsNodeId!;
    useHydraulicStore.getState().removeNode(taggedNodeId);
    useHydraulicStore.setState((s) => ({
      buildings: (s.buildings ?? []).map((bb) =>
        bb.id === "b1"
          ? { ...bb, taggedAsKind: undefined, taggedAsNodeId: undefined }
          : bb,
      ),
    }));

    const after = useHydraulicStore.getState();
    expect(after.nodes).toHaveLength(0);
    expect(after.buildings![0]!.taggedAsKind).toBeUndefined();
    expect(after.buildings![0]!.taggedAsNodeId).toBeUndefined();
  });

  it("all 8 TAG_AS_KIND_OPTIONS produce correct Mongolian labels", () => {
    const expected: Record<string, RegExp> = {
      source_substation: /^УДДТ-1$/,
      source_boiler: /^Зуух-1$/,
      consumer_apartment: /^АОС-1$/,
      consumer_school: /^АОЭ-1$/,
      consumer_industrial: /^АОБ-1$/,
      well_supply: /^ҮХТ-1$/,
      chamber: /^К-1$/,
      compensator_u: /^ЭӨ-1$/,
    };
    for (const opt of TAG_AS_KIND_OPTIONS) {
      useHydraulicStore.getState().reset();
      useHydraulicStore.setState({ buildings: [squareBuilding("b1")] });
      const store = useHydraulicStore.getState();
      const b = store.buildings![0]!;
      const { node, buildingPatch } = buildTagAsParams(b, opt.kind, store.nodes);
      store.addNode(node);
      useHydraulicStore.setState((s) => ({
        buildings: (s.buildings ?? []).map((bb) =>
          bb.id === "b1" ? { ...bb, ...buildingPatch } : bb,
        ),
      }));
      const label = useHydraulicStore.getState().nodes[0]!.label;
      const pattern = expected[opt.kind];
      if (pattern) {
        expect(label, `${opt.kind} should produce label matching ${pattern}`).toMatch(pattern);
      }
    }
  });
});
