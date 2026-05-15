/**
 * Phase 12.9 — DXF channel auto-detection tests.
 */
import { describe, it, expect } from "vitest";
import {
  findChannelAnnotations,
  detectChannelsFromDxf,
  resolveChannelEndpoints,
  buildChannelsFromDxfImport,
  CHANNEL_ANNOTATION_RANGE_M,
} from "../dxfChannelDetection";
import type { SchemePipe, SchemeNode } from "../../components/hydraulic/hydraulicTypes";

describe("findChannelAnnotations — regex layer", () => {
  it("matches plain Л-9 / Л-7 / Л-4 tokens", () => {
    const ann = findChannelAnnotations([
      { x: 10, y: 20, t: "Л-9" },
      { x: 30, y: 40, t: "Л-7" },
      { x: 50, y: 60, t: "Л-4" },
    ]);
    expect(ann.map((a) => a.channelType)).toEqual(["Л-9", "Л-7", "Л-4"]);
  });

  it("ignores non-channel text", () => {
    const ann = findChannelAnnotations([
      { x: 0, y: 0, t: "DN 150" },
      { x: 1, y: 1, t: "АОС-1" },
      { x: 2, y: 2, t: "ЦТП" },
    ]);
    expect(ann).toEqual([]);
  });

  it("parses 'Л-9 1500×610' with explicit dimensions", () => {
    const ann = findChannelAnnotations([{ x: 5, y: 6, t: "Л-9 1500×610" }]);
    expect(ann).toHaveLength(1);
    expect(ann[0]!.channelType).toBe("Л-9");
    expect(ann[0]!.width_mm).toBe(1500);
    expect(ann[0]!.height_mm).toBe(610);
  });

  it("parses 'Л-7 1200x580' with ASCII x separator", () => {
    const ann = findChannelAnnotations([{ x: 0, y: 0, t: "Л-7 1200x580" }]);
    expect(ann[0]!.width_mm).toBe(1200);
    expect(ann[0]!.height_mm).toBe(580);
  });

  it("parses 'Л-9 1500' width-only fallback", () => {
    const ann = findChannelAnnotations([{ x: 0, y: 0, t: "Л-9 1500" }]);
    expect(ann[0]!.width_mm).toBe(1500);
    expect(ann[0]!.height_mm).toBeUndefined();
  });

  it("accepts Latin 'L-9' transliteration", () => {
    const ann = findChannelAnnotations([{ x: 0, y: 0, t: "L-9 1500" }]);
    expect(ann[0]!.channelType).toBe("Л-9");
  });

  it("anchors at the text's (x, y) coordinates", () => {
    const ann = findChannelAnnotations([{ x: 100, y: 200, t: "Л-7" }]);
    expect(ann[0]!.x).toBe(100);
    expect(ann[0]!.y).toBe(200);
  });
});

describe("detectChannelsFromDxf — pipe → channel grouping", () => {
  it("groups 4 pipes near a Л-7 annotation into one channel", () => {
    const result = detectChannelsFromDxf({
      texts: [{ x: 50, y: 5, t: "Л-7 1200×580" }],
      pipes: [
        // 4 pipes lying along x=0..100, centre ≈ (50, 0). All within 8m of annotation at (50, 5).
        { pipeId: "p1", ax_m: 0, ay_m: 0, bx_m: 100, by_m: 0 },
        { pipeId: "p2", ax_m: 0, ay_m: 1, bx_m: 100, by_m: 1 },
        { pipeId: "p3", ax_m: 0, ay_m: 2, bx_m: 100, by_m: 2 },
        { pipeId: "p4", ax_m: 0, ay_m: 3, bx_m: 100, by_m: 3 },
      ],
    });
    expect(result.channels).toHaveLength(1);
    expect(result.channels[0]!.channelType).toBe("Л-7");
    expect(result.channels[0]!.crossSectionWidth_mm).toBe(1200);
    expect(result.channels[0]!.crossSectionHeight_mm).toBe(580);
    expect(result.channels[0]!.pipeIds).toHaveLength(4);
  });

  it("ignores pipes outside the annotation range", () => {
    const result = detectChannelsFromDxf({
      texts: [{ x: 0, y: 0, t: "Л-4" }],
      pipes: [
        // Centre at (50, 50) — too far from (0,0)
        { pipeId: "p_far", ax_m: 0, ay_m: 100, bx_m: 100, by_m: 100 },
        // Centre at (5, 5) — within range
        { pipeId: "p_near1", ax_m: 0, ay_m: 5, bx_m: 10, by_m: 5 },
        { pipeId: "p_near2", ax_m: 0, ay_m: 6, bx_m: 10, by_m: 6 },
      ],
    });
    expect(result.channels).toHaveLength(1);
    expect(result.channels[0]!.pipeIds.sort()).toEqual(["p_near1", "p_near2"]);
  });

  it("single-pipe annotation produces a warning + no channel", () => {
    const result = detectChannelsFromDxf({
      texts: [{ x: 0, y: 0, t: "Л-9" }],
      pipes: [{ pipeId: "p_lonely", ax_m: 0, ay_m: 0, bx_m: 10, by_m: 0 }],
    });
    expect(result.channels).toEqual([]);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toMatch(/Л-9/);
  });

  it("contention resolved by NEAREST annotation", () => {
    // Two annotations near each other; a pipe between them joins the closer one.
    const result = detectChannelsFromDxf({
      texts: [
        { x: 0, y: 0, t: "Л-4" },   // closer
        { x: 20, y: 0, t: "Л-9" },  // farther
      ],
      pipes: [
        // pipe centre at (4, 0) → distance to Л-4 is 4, to Л-9 is 16. Л-4 wins.
        { pipeId: "p_close_to_L4", ax_m: 0, ay_m: 0, bx_m: 8, by_m: 0 },
        // another close to Л-4
        { pipeId: "p_also_L4", ax_m: 0, ay_m: 1, bx_m: 8, by_m: 1 },
        // pipe centre at (20, 0) → close to Л-9
        { pipeId: "p_L9_1", ax_m: 16, ay_m: 0, bx_m: 24, by_m: 0 },
        { pipeId: "p_L9_2", ax_m: 16, ay_m: 1, bx_m: 24, by_m: 1 },
      ],
    });
    expect(result.channels).toHaveLength(2);
    const l4 = result.channels.find((c) => c.channelType === "Л-4")!;
    const l9 = result.channels.find((c) => c.channelType === "Л-9")!;
    expect(l4.pipeIds.sort()).toEqual(["p_also_L4", "p_close_to_L4"]);
    expect(l9.pipeIds.sort()).toEqual(["p_L9_1", "p_L9_2"]);
  });

  it("no annotations → empty result", () => {
    const result = detectChannelsFromDxf({
      texts: [{ x: 0, y: 0, t: "АОС-1" }],
      pipes: [{ pipeId: "p1", ax_m: 0, ay_m: 0, bx_m: 10, by_m: 0 }],
    });
    expect(result.channels).toEqual([]);
    expect(result.pipePatches.size).toBe(0);
  });

  it("registry defaults applied when annotation lacks dimensions", () => {
    const result = detectChannelsFromDxf({
      texts: [{ x: 0, y: 0, t: "Л-9" }],
      pipes: [
        { pipeId: "a", ax_m: 0, ay_m: 0, bx_m: 5, by_m: 0 },
        { pipeId: "b", ax_m: 0, ay_m: 1, bx_m: 5, by_m: 1 },
      ],
    });
    expect(result.channels[0]!.crossSectionWidth_mm).toBe(1500);
    expect(result.channels[0]!.crossSectionHeight_mm).toBe(610);
  });

  it("respects custom range_m override", () => {
    const result = detectChannelsFromDxf({
      texts: [{ x: 0, y: 0, t: "Л-7" }],
      pipes: [
        // 3 pipes far away but within a 20m range
        { pipeId: "p1", ax_m: 0, ay_m: 15, bx_m: 10, by_m: 15 },
        { pipeId: "p2", ax_m: 0, ay_m: 16, bx_m: 10, by_m: 16 },
        { pipeId: "p3", ax_m: 0, ay_m: 17, bx_m: 10, by_m: 17 },
      ],
      range_m: 20,
    });
    expect(result.channels).toHaveLength(1);
    expect(result.channels[0]!.pipeIds).toHaveLength(3);
  });

  it("default range constant is 8 metres", () => {
    expect(CHANNEL_ANNOTATION_RANGE_M).toBe(8);
  });
});

describe("resolveChannelEndpoints", () => {
  function p(over: Partial<SchemePipe>): SchemePipe {
    return {
      id: "x",
      fromNodeId: "a",
      toNodeId: "b",
      materialKey: "steel_aged",
      dn: 100,
      length_m: 10,
      ...over,
    };
  }

  it("picks the two degree-1 endpoints (trunk endpoints)", () => {
    // Channel runs A → B → C, with two pipes B-A and B-C sharing B.
    const pipes = [
      p({ id: "p1", fromNodeId: "A", toNodeId: "B" }),
      p({ id: "p2", fromNodeId: "B", toNodeId: "C" }),
    ];
    const endpoints = resolveChannelEndpoints(["p1", "p2"], pipes);
    expect(endpoints).not.toBeNull();
    // A and C are the degree-1 nodes
    expect([endpoints!.fromNodeId, endpoints!.toNodeId].sort()).toEqual(["A", "C"]);
  });

  it("falls back to first pipe's endpoints when degree analysis fails", () => {
    // Single pipe — both endpoints have degree 1
    const pipes = [p({ id: "p1", fromNodeId: "A", toNodeId: "B" })];
    const endpoints = resolveChannelEndpoints(["p1"], pipes);
    expect(endpoints).not.toBeNull();
    expect([endpoints!.fromNodeId, endpoints!.toNodeId].sort()).toEqual(["A", "B"]);
  });

  it("returns null when pipe ids don't match anything", () => {
    const pipes = [p({ id: "p1", fromNodeId: "A", toNodeId: "B" })];
    expect(resolveChannelEndpoints(["p_missing"], pipes)).toBeNull();
  });
});

describe("buildChannelsFromDxfImport — end-to-end with px conversion", () => {
  function node(id: string, x: number, y: number): SchemeNode {
    return { id, kind: "junction", label: id, x, y };
  }
  function pipe(over: Partial<SchemePipe>): SchemePipe {
    return {
      id: "x",
      fromNodeId: "n1",
      toNodeId: "n2",
      materialKey: "steel_aged",
      dn: 100,
      length_m: 10,
      ...over,
    };
  }

  it("converts canvas-px pipe coords to metres via pxPerMeter", () => {
    // Annotation at (50m, 5m) in DXF native units.
    // Nodes at (1000px, 0px) and (2000px, 0px) → 50m & 100m when pxPerMeter=20.
    // Pipe centre at (75m, 0m) — 25m away from (50, 5) — outside 8m default range.
    // Use range_m=30 to capture.
    const result = buildChannelsFromDxfImport({
      texts: [{ x: 50, y: 5, t: "Л-7" }],
      pipes: [
        pipe({ id: "p1", fromNodeId: "n1", toNodeId: "n2" }),
        pipe({ id: "p2", fromNodeId: "n1", toNodeId: "n2" }),
      ],
      nodes: [node("n1", 1000, 0), node("n2", 2000, 0)],
      pxPerMeter: 20,
      range_m: 30,
    });
    expect(result.channels).toHaveLength(1);
    expect(result.channels[0]!.channelType).toBe("Л-7");
  });

  it("resolves channel endpoints from contained pipes' nodes", () => {
    const result = buildChannelsFromDxfImport({
      texts: [{ x: 50, y: 0, t: "Л-7" }],
      pipes: [
        pipe({ id: "p1", fromNodeId: "A", toNodeId: "B" }),
        pipe({ id: "p2", fromNodeId: "B", toNodeId: "C" }),
      ],
      // Place A, B, C at metres → 0, 50, 100 m on x-axis (range covers all)
      nodes: [
        node("A", 0, 0),
        node("B", 50, 0),
        node("C", 100, 0),
      ],
      pxPerMeter: 1,
      range_m: 80,
    });
    expect(result.channels).toHaveLength(1);
    const endpoints = [result.channels[0]!.fromNodeId, result.channels[0]!.toNodeId].sort();
    // A and C are degree-1 in the sub-graph
    expect(endpoints).toEqual(["A", "C"]);
  });

  it("emits patches as a Map<pipeId, channelId>", () => {
    const result = buildChannelsFromDxfImport({
      texts: [{ x: 0, y: 0, t: "Л-4" }],
      pipes: [
        pipe({ id: "p1", fromNodeId: "A", toNodeId: "B" }),
        pipe({ id: "p2", fromNodeId: "B", toNodeId: "C" }),
      ],
      nodes: [node("A", 0, 0), node("B", 5, 0), node("C", 10, 0)],
      pxPerMeter: 1,
    });
    expect(result.pipePatches.size).toBe(2);
    expect(result.pipePatches.get("p1")).toBe(result.channels[0]!.id);
    expect(result.pipePatches.get("p2")).toBe(result.channels[0]!.id);
  });

  it("no annotations → empty channels + patches", () => {
    const result = buildChannelsFromDxfImport({
      texts: [{ x: 0, y: 0, t: "DN 100" }],
      pipes: [pipe({ id: "p1", fromNodeId: "A", toNodeId: "B" })],
      nodes: [node("A", 0, 0), node("B", 10, 0)],
      pxPerMeter: 1,
    });
    expect(result.channels).toEqual([]);
    expect(result.pipePatches.size).toBe(0);
  });
});
