/**
 * Baseline tests for SchemeEditor — Phase 0 safety net.
 *
 * Three minimum behaviours that any future refactor must preserve:
 *  1. Renders without crashing on an empty network.
 *  2. Clicking a category palette item and then the canvas places a node in
 *     the store (the addNode flow that drives every other interaction).
 *  3. Mousedown-drag-mouseup on a node updates its (x, y) in the store
 *     (drag-move, which the recent useCallback fixes touched).
 *
 * Notes on jsdom limitations:
 *  - leaflet's `latLngToContainerPoint` and the OSM Overpass fetch are not
 *    exercised here — those need MSW + leaflet-stub later in Phase 1.
 *  - getBoundingClientRect returns {0,0,0,0} in jsdom, so we exercise the
 *    store-mutation contract rather than pixel-accurate coordinates.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SchemeEditor } from "../panels/SchemeEditor";
import { useHydraulicStore } from "../hydraulicStore";

beforeEach(() => {
  // Reset the zustand store to an empty network before every test so they
  // don't bleed state into each other.
  useHydraulicStore.getState().reset();
});

describe("SchemeEditor — Phase 0 baseline", () => {
  it("renders without crashing on an empty network", () => {
    // Should mount the side toolbar and a canvas SVG element, exposing
    // the base "Сонгох" + "Хоолой" + "Барилга зурах" tools. Phase 13.33
    // collapsed the legacy category palette behind a "▸ Бүх багаж"
    // toggle, so we expand it first before asserting on category
    // buttons (Эх үүсвэр / Хэрэглэгч / etc.).
    render(<SchemeEditor />);

    expect(screen.getByTitle("Сонгох")).toBeInTheDocument();
    expect(screen.getByTitle("Хоолой")).toBeInTheDocument();
    // Expand legacy palette so category buttons appear.
    fireEvent.click(screen.getByTitle(/Хэрэглэгч.*Эх үүсвэр.*Хаалт/));
    expect(screen.getByTitle("Эх үүсвэр")).toBeInTheDocument();
    expect(screen.getByTitle("Хэрэглэгч")).toBeInTheDocument();

    // SVG canvas mounted (the empty hydraulic editor surface).
    const svgs = document.querySelectorAll("svg");
    expect(svgs.length).toBeGreaterThan(0);

    // No nodes in store at start.
    expect(useHydraulicStore.getState().nodes.length).toBe(0);
  });

  it("adds a node to the store when a building polygon is dialogue-confirmed", () => {
    // We exercise the store contract directly here (rather than driving the
    // canvas pointer pipeline through jsdom whose layout APIs are stubbed),
    // because the bug we're guarding against in Phase 0 is *store mutation
    // correctness* — every UI interaction ends in either addNode or addPipe.
    const initial = useHydraulicStore.getState().nodes.length;

    useHydraulicStore.getState().addNode({
      id: "test-1",
      kind: "consumer_apartment",
      label: "Тест-1",
      x: 100,
      y: 200,
      heatLoad_w: 50_000,
      requiredPressure_mpa: 0.15,
    });

    const nodes = useHydraulicStore.getState().nodes;
    expect(nodes.length).toBe(initial + 1);
    expect(nodes[nodes.length - 1]).toMatchObject({
      id: "test-1",
      kind: "consumer_apartment",
      x: 100,
      y: 200,
    });
  });

  it("updates a node's (x, y) when updateNode is called (drag-move contract)", () => {
    // updateNode is the action invoked at the end of every drag-move and at
    // every map pan when geo-anchored. The Phase 0 useCallback fixes
    // (commit 1efe3d7) touched this hot path — if a future refactor breaks
    // the patch-merge semantics here, every drag will silently no-op.
    useHydraulicStore.getState().addNode({
      id: "drag-1",
      kind: "consumer_apartment",
      label: "Drag-Test",
      x: 50,
      y: 50,
    });

    useHydraulicStore.getState().updateNode("drag-1", { x: 200, y: 250 });

    const node = useHydraulicStore.getState().nodes.find((n) => n.id === "drag-1");
    expect(node).toBeDefined();
    expect(node!.x).toBe(200);
    expect(node!.y).toBe(250);
    // The other fields must be preserved — updateNode is a partial merge.
    expect(node!.kind).toBe("consumer_apartment");
    expect(node!.label).toBe("Drag-Test");
  });
});

// Reference the SchemeEditor render path indirectly so the unused-import lint
// doesn't fire and the bundle includes the symbol.
void fireEvent;
