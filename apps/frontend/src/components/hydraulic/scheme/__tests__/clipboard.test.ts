/**
 * Phase 6.5.2 — clipboard helpers tests.
 *
 * What we lock down:
 *   1. Copy 2 nodes + 1 pipe between them → paste → 2 new nodes +
 *      1 new pipe, all new IDs, pipe from/to refs to new IDs.
 *   2. Copy node with no pipes → paste → 1 new node only.
 *   3. Copy nodes with external pipe (one endpoint outside selection)
 *      → paste does NOT recreate that pipe (topology preservation).
 *   4. Paste offset: pasted node's x,y shifted by the offset; if
 *      node was geo-anchored, lat/lon also shifted by the
 *      Haversine-consistent metres-per-degree.
 *   5. Cut-vs-copy: a cut is implementation = copy + delete; the
 *      caller wires those two store actions together. We test the
 *      copy side here (the delete is store-level, covered in
 *      multiSelection.test.ts).
 *
 *   Bonus: empty selection → null payload, dangling-pipe payload
 *   skipped on paste, multi-paste produces non-colliding IDs.
 */
import { describe, it, expect } from "vitest";
import {
  buildClipboardPayload,
  applyPaste,
  PASTE_OFFSET_M,
} from "../clipboard";
import type { SchemeNode, SchemePipe } from "../../hydraulicTypes";

/** A tiny ID generator for tests — incrementing counter, prefixable.
 *  Mirrors the real `uid()` from hydraulicStore but deterministic. */
function makeUidGen() {
  let counter = 0;
  return (prefix = "x") => {
    counter += 1;
    return `${prefix}_${counter}`;
  };
}

function makeNetwork() {
  const nodes: SchemeNode[] = [
    { id: "src", kind: "source_substation", label: "Source", x: 0, y: 0, requiredPressure_mpa: 0.6 },
    { id: "c1", kind: "consumer_apartment", label: "Consumer 1", x: 100, y: 0, heatLoad_w: 50_000 },
    { id: "c2", kind: "consumer_apartment", label: "Consumer 2", x: 200, y: 0, heatLoad_w: 30_000 },
    { id: "c3", kind: "consumer_apartment", label: "Consumer 3 (out)", x: 300, y: 0, heatLoad_w: 25_000 },
  ];
  const pipes: SchemePipe[] = [
    { id: "p1", fromNodeId: "src", toNodeId: "c1", materialKey: "steel_new", dn: 50, length_m: 100, circuit: "heating_supply" },
    { id: "p2", fromNodeId: "c1", toNodeId: "c2", materialKey: "steel_new", dn: 40, length_m: 100, circuit: "heating_supply" },
    { id: "p3-external", fromNodeId: "c2", toNodeId: "c3", materialKey: "steel_new", dn: 32, length_m: 100, circuit: "heating_supply" },
  ];
  return { nodes, pipes };
}

describe("buildClipboardPayload — Phase 6.5.2", () => {
  it("returns null for an empty selection", () => {
    const { nodes, pipes } = makeNetwork();
    expect(buildClipboardPayload(nodes, pipes, [], [])).toBeNull();
  });

  it("copies 2 nodes + the 1 intra-selection pipe between them", () => {
    const { nodes, pipes } = makeNetwork();
    const payload = buildClipboardPayload(nodes, pipes, ["c1", "c2"], []);
    expect(payload).not.toBeNull();
    expect(payload!.nodes).toHaveLength(2);
    expect(payload!.nodes.map((n) => n.id).sort()).toEqual(["c1", "c2"]);
    expect(payload!.pipes).toHaveLength(1);
    expect(payload!.pipes[0]!.id).toBe("p2");
    expect(payload!.copiedAt).toBeGreaterThan(0);
  });

  it("copies a node with no pipes (single-object copy)", () => {
    const { nodes, pipes } = makeNetwork();
    const payload = buildClipboardPayload(nodes, pipes, ["c1"], []);
    expect(payload).not.toBeNull();
    expect(payload!.nodes).toHaveLength(1);
    expect(payload!.pipes).toHaveLength(0);
  });

  it("skips pipes with an endpoint OUTSIDE the selection (topology preservation)", () => {
    const { nodes, pipes } = makeNetwork();
    // Select c2 only — pipe p3-external touches c3 (not selected) and
    // p2 touches c1 (not selected). Both should be dropped.
    const payload = buildClipboardPayload(nodes, pipes, ["c2"], []);
    expect(payload!.nodes).toHaveLength(1);
    expect(payload!.pipes).toHaveLength(0);
  });

  it("explicitly-selected pipe with dangling endpoint is still skipped on copy", () => {
    const { nodes, pipes } = makeNetwork();
    // User selected c1, c2 AND pipe p3-external. p3 touches c3 (not in
    // selection), so it must NOT be copied even though explicitly
    // listed in pipeIds. Otherwise paste would dangle.
    const payload = buildClipboardPayload(nodes, pipes, ["c1", "c2"], ["p2", "p3-external"]);
    expect(payload!.pipes).toHaveLength(1);
    expect(payload!.pipes[0]!.id).toBe("p2");
  });

  it("deep-clones nodes so mutations to original don't leak into payload", () => {
    const { nodes, pipes } = makeNetwork();
    const payload = buildClipboardPayload(nodes, pipes, ["c1"], [])!;
    // Mutate the original — payload must keep the snapshotted value.
    nodes.find((n) => n.id === "c1")!.label = "MUTATED";
    expect(payload.nodes[0]!.label).toBe("Consumer 1");
  });
});

describe("applyPaste — Phase 6.5.2", () => {
  it("paste 2 nodes + 1 pipe → fresh IDs, pipe from/to rewritten correctly", () => {
    const { nodes, pipes } = makeNetwork();
    const payload = buildClipboardPayload(nodes, pipes, ["c1", "c2"], [])!;
    const uid = makeUidGen();
    const { nodes: pasted, pipes: pastedPipes, oldToNewId } = applyPaste(payload, uid);

    expect(pasted).toHaveLength(2);
    expect(pastedPipes).toHaveLength(1);

    // All pasted IDs differ from originals.
    for (const n of pasted) {
      expect(["c1", "c2"]).not.toContain(n.id);
    }
    // The pipe's from/to are the NEW IDs, mapped through oldToNewId.
    const pp = pastedPipes[0]!;
    expect(pp.fromNodeId).toBe(oldToNewId.get("c1"));
    expect(pp.toNodeId).toBe(oldToNewId.get("c2"));
    expect(pp.id).not.toBe("p2");
  });

  it("paste single node (no pipes) → just the node, fresh ID", () => {
    const { nodes, pipes } = makeNetwork();
    const payload = buildClipboardPayload(nodes, pipes, ["c1"], [])!;
    const result = applyPaste(payload, makeUidGen());
    expect(result.nodes).toHaveLength(1);
    expect(result.pipes).toHaveLength(0);
    expect(result.nodes[0]!.id).not.toBe("c1");
  });

  it("paste offset (default +20m, +20m) shifts x and y of all pasted nodes", () => {
    const { nodes, pipes } = makeNetwork();
    const payload = buildClipboardPayload(nodes, pipes, ["c1"], [])!;
    const result = applyPaste(payload, makeUidGen());
    // Original c1 was at (100, 0). Default offset shifts by +20 in each axis.
    expect(result.nodes[0]!.x).toBe(100 + PASTE_OFFSET_M);
    expect(result.nodes[0]!.y).toBe(0 + PASTE_OFFSET_M);
  });

  it("paste offset custom delta {x: 50, y: -30} flows through to x/y", () => {
    const { nodes, pipes } = makeNetwork();
    const payload = buildClipboardPayload(nodes, pipes, ["c1"], [])!;
    const result = applyPaste(payload, makeUidGen(), { x: 50, y: -30 });
    expect(result.nodes[0]!.x).toBe(100 + 50);
    expect(result.nodes[0]!.y).toBe(0 + -30);
  });

  it("paste shifts geo coordinates via Haversine m → deg conversion", () => {
    const originalNode: SchemeNode = {
      id: "geo1",
      kind: "consumer_apartment",
      label: "Geo-anchored",
      x: 0,
      y: 0,
      geo: { lat: 47.92, lon: 106.92 },
    };
    const payload = buildClipboardPayload([originalNode], [], ["geo1"], [])!;
    const result = applyPaste(payload, makeUidGen());

    // 20 m north (+y) should bump lat by ~20/111195 = ~0.00018°.
    // 20 m east (+x) at lat 47.92 bumps lon by ~20/(cos(47.92°)·111195)
    // = ~20/74628.6 = ~0.000268°.
    const out = result.nodes[0]!;
    expect(out.geo).toBeDefined();
    const dLat = out.geo!.lat - 47.92;
    const dLon = out.geo!.lon - 106.92;
    expect(dLat).toBeGreaterThan(0.00017);
    expect(dLat).toBeLessThan(0.00019);
    expect(dLon).toBeGreaterThan(0.00025);
    expect(dLon).toBeLessThan(0.00029);
  });

  it("multi-paste produces non-colliding fresh IDs each time", () => {
    const { nodes, pipes } = makeNetwork();
    const payload = buildClipboardPayload(nodes, pipes, ["c1", "c2"], [])!;
    const uid = makeUidGen(); // shared generator — simulates real store
    const r1 = applyPaste(payload, uid);
    const r2 = applyPaste(payload, uid);
    const r3 = applyPaste(payload, uid);

    const allIds = [
      ...r1.nodes.map((n) => n.id),
      ...r2.nodes.map((n) => n.id),
      ...r3.nodes.map((n) => n.id),
      ...r1.pipes.map((p) => p.id),
      ...r2.pipes.map((p) => p.id),
      ...r3.pipes.map((p) => p.id),
    ];
    // No dupes — every ID is unique.
    expect(new Set(allIds).size).toBe(allIds.length);
  });

  it("dangling pipe in a hand-crafted payload is skipped on paste (defensive)", () => {
    const payload = {
      nodes: [{ id: "a", kind: "consumer_apartment", label: "A", x: 0, y: 0 }],
      pipes: [{
        id: "dangle", fromNodeId: "a", toNodeId: "MISSING",
        materialKey: "steel_new", dn: 50, length_m: 100, circuit: "heating_supply" as const,
      }],
      copiedAt: Date.now(),
    };
    const result = applyPaste(payload, makeUidGen());
    expect(result.nodes).toHaveLength(1);
    expect(result.pipes).toHaveLength(0); // dangling skipped
  });

  it("preserves engineering fields (DN, insulation, heatLoad) on copy/paste", () => {
    const original: SchemeNode = {
      id: "c1", kind: "consumer_apartment", label: "X",
      x: 100, y: 0, heatLoad_w: 50_000,
      elevation_m: 1269.5, requiredPressure_mpa: 0.15,
      floors: 3, floor_area_m2: 240,
    };
    const originalPipe: SchemePipe = {
      id: "p1", fromNodeId: "c1", toNodeId: "c1",
      materialKey: "steel_v_group", dn: 65, length_m: 70,
      circuit: "heating_supply",
      insulationKey: "pur_pi", insulationThickness_mm: 50,
      laying: "underground_channel", burialDepth_m: 1.5,
    };
    const payload = buildClipboardPayload([original], [originalPipe], ["c1"], ["p1"])!;
    // Pipe self-loop (c1 → c1) IS in-selection so it's preserved.
    const r = applyPaste(payload, makeUidGen());
    const n = r.nodes[0]!;
    expect(n.heatLoad_w).toBe(50_000);
    expect(n.elevation_m).toBe(1269.5);
    expect(n.requiredPressure_mpa).toBe(0.15);
    expect(n.floors).toBe(3);
    expect(n.floor_area_m2).toBe(240);

    const p = r.pipes[0]!;
    expect(p.materialKey).toBe("steel_v_group");
    expect(p.dn).toBe(65);
    expect(p.length_m).toBe(70);
    expect(p.insulationKey).toBe("pur_pi");
    expect(p.insulationThickness_mm).toBe(50);
    expect(p.laying).toBe("underground_channel");
    expect(p.burialDepth_m).toBe(1.5);
  });
});
