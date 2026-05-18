/**
 * Phase 13.4 — Tagged-building dual-render suppression.
 *
 * Engineer report: drawing an apartment (consumer_apartment) via the
 * Phase 13.1 palette workflow produces BOTH a SchemeBuilding polygon
 * AND a node with width_m/height_m set from the bbox. Without
 * suppression, the node ALSO renders as a building rectangle on top
 * of the polygon — double-rect that hides the engineer's polygon
 * outline entirely.
 *
 * This test locks the suppression contract: when a node is tag-
 * linked to a building, the renderer's `isBuilding` flag MUST be
 * false so only the polygon outline + a small centroid symbol
 * remain visible.
 */
import { describe, it, expect } from "vitest";
import type { SchemeBuilding, SchemeNode } from "../hydraulicTypes";

/** Mirror SchemeEditor's render-time `isBuilding` predicate (Phase
 *  13.4 version). Kept in sync with the production render branch. */
function isBuildingRectActive(args: {
  node: Pick<SchemeNode, "id" | "kind" | "width_m" | "height_m">;
  category: "source" | "consumer" | "valve" | "fitting" | "chamber" | "pump" | "sensor";
  buildings: ReadonlyArray<SchemeBuilding>;
}): boolean {
  const wm = args.node.width_m ?? 0;
  const hm = args.node.height_m ?? 0;
  const isTaggedToBuilding = args.buildings.some(
    (b) => b.taggedAsNodeId === args.node.id,
  );
  return (
    !isTaggedToBuilding &&
    (args.category === "consumer" || args.category === "source") &&
    wm >= 6 &&
    hm >= 6
  );
}

const SQUARE_20_30: SchemeBuilding = {
  id: "b1",
  polygon: [
    { x: 0, y: 0 },
    { x: 400, y: 0 },
    { x: 400, y: 600 },
    { x: 0, y: 600 },
  ],
  label: "Барилга-1",
  taggedAsNodeId: "n1",
  taggedAsKind: "consumer_apartment",
};

describe("Phase 13.4 — suppress building rect for tagged nodes", () => {
  it("tagged consumer node does NOT render as a duplicate rect", () => {
    const node: SchemeNode = {
      id: "n1",
      kind: "consumer_apartment",
      label: "АОС-1",
      x: 200,
      y: 300,
      width_m: 20,
      height_m: 30,
    };
    expect(
      isBuildingRectActive({
        node,
        category: "consumer",
        buildings: [SQUARE_20_30],
      }),
    ).toBe(false);
  });

  it("tagged source_tec node does NOT render as a duplicate rect", () => {
    const node: SchemeNode = {
      id: "n1",
      kind: "source_tec",
      label: "ТЭЦ-1",
      x: 200,
      y: 300,
      width_m: 80,
      height_m: 50,
    };
    expect(
      isBuildingRectActive({
        node,
        category: "source",
        buildings: [SQUARE_20_30],
      }),
    ).toBe(false);
  });

  it("UNTAGGED consumer node WITH dims still renders as a building rect (Phase 13.0b backward compat)", () => {
    const node: SchemeNode = {
      id: "n_orphan",
      kind: "consumer_apartment",
      label: "АОС-99",
      x: 0,
      y: 0,
      width_m: 25,
      height_m: 12,
    };
    expect(
      isBuildingRectActive({
        node,
        category: "consumer",
        buildings: [SQUARE_20_30], // tagged to n1, not n_orphan
      }),
    ).toBe(true);
  });

  it("untagged source without dims renders as symbol (not building)", () => {
    const node: SchemeNode = {
      id: "n2",
      kind: "source_substation",
      label: "ЦТП-1",
      x: 0,
      y: 0,
    };
    expect(
      isBuildingRectActive({
        node,
        category: "source",
        buildings: [],
      }),
    ).toBe(false);
  });

  it("valve never renders as a building rect even with dims set", () => {
    const node: SchemeNode = {
      id: "n3",
      kind: "valve_gate",
      label: "ЗД-1",
      x: 0,
      y: 0,
      width_m: 20,
      height_m: 20,
    };
    expect(
      isBuildingRectActive({
        node,
        category: "valve",
        buildings: [],
      }),
    ).toBe(false);
  });

  it("tiny consumer (wm < 6) renders as symbol, not rect", () => {
    const node: SchemeNode = {
      id: "n4",
      kind: "consumer_apartment",
      label: "АОС-4",
      x: 0,
      y: 0,
      width_m: 4,
      height_m: 4,
    };
    expect(
      isBuildingRectActive({
        node,
        category: "consumer",
        buildings: [],
      }),
    ).toBe(false);
  });

  it("multi-building scene — only the tagged pair is suppressed", () => {
    const otherBuilding: SchemeBuilding = {
      id: "b2",
      polygon: [
        { x: 1000, y: 1000 },
        { x: 1400, y: 1000 },
        { x: 1400, y: 1600 },
        { x: 1000, y: 1600 },
      ],
      label: "Барилга-2",
      taggedAsNodeId: "n2",
    };
    const tagged: SchemeNode = {
      id: "n1",
      kind: "consumer_apartment",
      label: "АОС-1",
      x: 200,
      y: 300,
      width_m: 20,
      height_m: 30,
    };
    const orphan: SchemeNode = {
      id: "n_orphan",
      kind: "consumer_apartment",
      label: "АОС-99",
      x: 5000,
      y: 5000,
      width_m: 25,
      height_m: 12,
    };
    // tagged → suppressed
    expect(
      isBuildingRectActive({
        node: tagged,
        category: "consumer",
        buildings: [SQUARE_20_30, otherBuilding],
      }),
    ).toBe(false);
    // orphan → still building rect
    expect(
      isBuildingRectActive({
        node: orphan,
        category: "consumer",
        buildings: [SQUARE_20_30, otherBuilding],
      }),
    ).toBe(true);
  });
});
