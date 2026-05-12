/**
 * Unit tests for network topology helpers (apps/frontend/.../calc/topology.ts).
 *
 * Toy 3-node network — the simplest case that exercises every helper:
 *
 *       (source A) ── pipe_1 ─→ (junction B) ── pipe_2 ─→ (consumer C)
 *           id="A"      L=50          id="B"      L=70          id="C"
 *
 * Tests:
 *  - buildDirectedAdjacency keeps direction
 *  - buildUndirectedAdjacency reaches B from C and A from B
 *  - findLongestPath returns A → B → C with totalLengthM = 120
 *  - pathToConsumer returns the same sequence
 *  - pickAutoSource finds A because it has kind "source_*"
 */
import { describe, it, expect } from "vitest";
import {
  buildDirectedAdjacency,
  buildUndirectedAdjacency,
  findLongestPath,
  pathToConsumer,
  pickAutoSource,
} from "../topology";
import type { SchemeNode, SchemePipe } from "../../hydraulicTypes";

const NODES: SchemeNode[] = [
  { id: "A", kind: "source_substation", label: "ЦТП-A", x: 0, y: 0 },
  { id: "B", kind: "chamber", label: "Камер-B", x: 50, y: 0 },
  { id: "C", kind: "consumer_apartment", label: "ОС-C", x: 120, y: 0 },
];

const PIPES: SchemePipe[] = [
  { id: "pipe_1", fromNodeId: "A", toNodeId: "B", materialKey: "steel_aged", dn: 50, length_m: 50, circuit: "heating_supply" },
  { id: "pipe_2", fromNodeId: "B", toNodeId: "C", materialKey: "steel_aged", dn: 50, length_m: 70, circuit: "heating_supply" },
];

describe("topology — toy 3-node network", () => {
  it("buildDirectedAdjacency keeps forward direction only", () => {
    const adj = buildDirectedAdjacency(PIPES);
    expect(adj.get("A")?.map((p) => p.id)).toEqual(["pipe_1"]);
    expect(adj.get("B")?.map((p) => p.id)).toEqual(["pipe_2"]);
    expect(adj.get("C")).toBeUndefined(); // C has no outgoing pipes
  });

  it("buildUndirectedAdjacency reaches both endpoints with orientation flag", () => {
    const adj = buildUndirectedAdjacency(PIPES);
    expect(adj.get("A")?.length).toBe(1);
    expect(adj.get("B")?.length).toBe(2); // pipe_1 (backward) + pipe_2 (forward)
    expect(adj.get("C")?.length).toBe(1);
    // Verify orientation flag: B sees pipe_1 as backward
    const bEntries = adj.get("B")!;
    const pipe1FromB = bEntries.find((e) => e.pipe.id === "pipe_1")!;
    expect(pipe1FromB.forward).toBe(false);
    const pipe2FromB = bEntries.find((e) => e.pipe.id === "pipe_2")!;
    expect(pipe2FromB.forward).toBe(true);
  });

  it("findLongestPath(A) returns A → B → C with totalLengthM = 120", () => {
    const result = findLongestPath(NODES, PIPES, "A");
    expect(result).not.toBeNull();
    expect(result!.nodeIds).toEqual(["A", "B", "C"]);
    expect(result!.pipes.map((p) => p.pipe.id)).toEqual(["pipe_1", "pipe_2"]);
    expect(result!.totalLengthM).toBe(120);
  });

  it("findLongestPath returns null on empty graphs", () => {
    expect(findLongestPath([], [], "A")).toBeNull();
    expect(findLongestPath(NODES, [], "A")).toBeNull();
    expect(findLongestPath(NODES, PIPES, "Z")).toBeNull(); // unknown source
  });

  it("pathToConsumer(A → C) returns the same sequence as longest path", () => {
    const result = pathToConsumer(NODES, PIPES, "A", "C");
    expect(result).not.toBeNull();
    expect(result!.nodeIds).toEqual(["A", "B", "C"]);
    expect(result!.pipes.map((p) => p.pipe.id)).toEqual(["pipe_1", "pipe_2"]);
    expect(result!.totalLengthM).toBe(120);
  });

  it("pathToConsumer(A → A) is a degenerate zero-length result", () => {
    const result = pathToConsumer(NODES, PIPES, "A", "A");
    expect(result).not.toBeNull();
    expect(result!.nodeIds).toEqual(["A"]);
    expect(result!.pipes).toEqual([]);
    expect(result!.totalLengthM).toBe(0);
  });

  it("pickAutoSource finds the source_substation node A", () => {
    const src = pickAutoSource(NODES);
    expect(src?.id).toBe("A");
  });

  it("pickAutoSource falls back to first node if no source_* exists", () => {
    const onlyJunctions: SchemeNode[] = [
      { id: "X", kind: "chamber", label: "X", x: 0, y: 0 },
      { id: "Y", kind: "chamber", label: "Y", x: 10, y: 0 },
    ];
    expect(pickAutoSource(onlyJunctions)?.id).toBe("X");
  });
});

describe("topology — branching network (one source, two consumers)", () => {
  // Y-shape: A → B → C  AND  A → B → D
  //          50m  70m            50m  90m  (D is the farther consumer)
  const branchNodes: SchemeNode[] = [
    { id: "A", kind: "source_substation", label: "ЦТП-A", x: 0, y: 0 },
    { id: "B", kind: "chamber", label: "Камер-B", x: 50, y: 0 },
    { id: "C", kind: "consumer_apartment", label: "ОС-C", x: 120, y: 0 },
    { id: "D", kind: "consumer_apartment", label: "ОС-D", x: 140, y: 50 },
  ];
  const branchPipes: SchemePipe[] = [
    { id: "AB", fromNodeId: "A", toNodeId: "B", materialKey: "steel_aged", dn: 65, length_m: 50, circuit: "heating_supply" },
    { id: "BC", fromNodeId: "B", toNodeId: "C", materialKey: "steel_aged", dn: 50, length_m: 70, circuit: "heating_supply" },
    { id: "BD", fromNodeId: "B", toNodeId: "D", materialKey: "steel_aged", dn: 50, length_m: 90, circuit: "heating_supply" },
  ];

  it("findLongestPath picks the longer branch (A→B→D, 140 m), not the shorter one", () => {
    const result = findLongestPath(branchNodes, branchPipes, "A");
    expect(result).not.toBeNull();
    expect(result!.nodeIds).toEqual(["A", "B", "D"]);
    expect(result!.totalLengthM).toBe(140);
  });

  it("pathToConsumer(A → C) returns the C branch, not the D branch", () => {
    const result = pathToConsumer(branchNodes, branchPipes, "A", "C");
    expect(result).not.toBeNull();
    expect(result!.nodeIds).toEqual(["A", "B", "C"]);
    expect(result!.totalLengthM).toBe(120);
  });
});
