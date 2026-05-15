/**
 * Phase 12.7 — Channel label-panel helper tests.
 */
import { describe, it, expect } from "vitest";
import {
  buildChannelLabel,
  buildTypeLine,
  buildPipesLine,
  buildMetaLine,
  channelMidpoint,
  isLabelVisible,
  labelDimensions,
  DEFAULT_LABEL_OFFSET,
} from "../channelLabelPanel";
import { buildChannelFromDraw } from "../channelOperations";
import type { SchemeChannel, SchemeNode, SchemePipe } from "../../hydraulicTypes";

const NODE_A: SchemeNode = { id: "a", kind: "junction", label: "A", x: 0, y: 0 };
const NODE_B: SchemeNode = { id: "b", kind: "junction", label: "B", x: 200, y: 0 };

describe("buildTypeLine", () => {
  it("standard channel returns 'Л-X WIDTH×HEIGHT'", () => {
    const ch: SchemeChannel = {
      id: "ch", fromNodeId: "a", toNodeId: "b", pipeIds: [],
      channelType: "Л-9", crossSectionWidth_mm: 1500, crossSectionHeight_mm: 610,
    };
    expect(buildTypeLine(ch)).toBe("Л-9 1500×610");
  });

  it("custom channel returns 'Сонголтоор WIDTH×HEIGHT'", () => {
    const ch: SchemeChannel = {
      id: "ch", fromNodeId: "a", toNodeId: "b", pipeIds: [],
      channelType: "custom", crossSectionWidth_mm: 850, crossSectionHeight_mm: 500,
    };
    expect(buildTypeLine(ch)).toBe("Сонголтоор 850×500");
  });

  it("custom channel without dimensions returns just 'Сонголтоор'", () => {
    const ch: SchemeChannel = {
      id: "ch", fromNodeId: "a", toNodeId: "b", pipeIds: [],
      channelType: "custom",
    };
    expect(buildTypeLine(ch)).toBe("Сонголтоор");
  });

  it("falls back to CHANNEL_TYPE_REGISTRY when dimensions absent", () => {
    const ch: SchemeChannel = {
      id: "ch", fromNodeId: "a", toNodeId: "b", pipeIds: [],
      channelType: "Л-7",
    };
    expect(buildTypeLine(ch)).toBe("Л-7 1200×580");
  });

  it("returns empty string when channelType is undefined", () => {
    const ch: SchemeChannel = {
      id: "ch", fromNodeId: "a", toNodeId: "b", pipeIds: [],
    };
    expect(buildTypeLine(ch)).toBe("");
  });
});

describe("buildPipesLine", () => {
  function pipe(circuit: string, dn: number, id: string = "p"): SchemePipe {
    return {
      id, fromNodeId: "a", toNodeId: "b", materialKey: "steel_aged",
      dn, length_m: 10, circuit: circuit as SchemePipe["circuit"],
    };
  }

  it("formats canonical order with Cyrillic Д prefix + Φ", () => {
    const pipes = [
      pipe("heating_supply", 150, "p1"),
      pipe("heating_return", 150, "p2"),
      pipe("dhw_supply", 100, "p3"),
      pipe("dhw_recirc", 80, "p4"),
      pipe("cold_water", 50, "p5"),
    ];
    expect(buildPipesLine(pipes)).toBe(
      "Д2.1 Φ150 · Д2.2 Φ150 · Д3 Φ100 · Д4 Φ80 · У1 Φ50",
    );
  });

  it("re-sorts pipes into canonical order if input is shuffled", () => {
    const pipes = [
      pipe("cold_water", 50, "p5"),
      pipe("dhw_supply", 100, "p3"),
      pipe("heating_supply", 150, "p1"),
    ];
    expect(buildPipesLine(pipes)).toBe("Д2.1 Φ150 · Д3 Φ100 · У1 Φ50");
  });

  it("returns empty string for zero pipes", () => {
    expect(buildPipesLine([])).toBe("");
  });

  it("legacy pipe without circuit goes to tail with '?' code", () => {
    const pipes: SchemePipe[] = [
      // No circuit field
      { id: "x", fromNodeId: "a", toNodeId: "b", materialKey: "steel_aged", dn: 50, length_m: 10 },
      pipe("heating_supply", 150, "p1"),
    ];
    const line = buildPipesLine(pipes);
    expect(line.startsWith("Д2.1 Φ150")).toBe(true);
    expect(line.endsWith("? Φ50")).toBe(true);
  });
});

describe("buildMetaLine", () => {
  it("renders L + h when both set", () => {
    const ch: SchemeChannel = {
      id: "ch", fromNodeId: "a", toNodeId: "b", pipeIds: [],
      burialDepth_m: 1.2,
    };
    const pipes: SchemePipe[] = [
      { id: "p", fromNodeId: "a", toNodeId: "b", materialKey: "steel_aged", dn: 100, length_m: 85, circuit: "heating_supply" },
    ];
    expect(buildMetaLine(pipes, ch)).toBe("L=85.0 м · h=1.2 м");
  });

  it("renders only L when burial depth unset", () => {
    const ch: SchemeChannel = { id: "ch", fromNodeId: "a", toNodeId: "b", pipeIds: [] };
    const pipes: SchemePipe[] = [
      { id: "p", fromNodeId: "a", toNodeId: "b", materialKey: "steel_aged", dn: 100, length_m: 12.5, circuit: "heating_supply" },
    ];
    expect(buildMetaLine(pipes, ch)).toBe("L=12.5 м");
  });

  it("renders only h when length missing/zero", () => {
    const ch: SchemeChannel = {
      id: "ch", fromNodeId: "a", toNodeId: "b", pipeIds: [], burialDepth_m: 0.8,
    };
    expect(buildMetaLine([], ch)).toBe("h=0.8 м");
  });

  it("returns empty when both are missing", () => {
    const ch: SchemeChannel = { id: "ch", fromNodeId: "a", toNodeId: "b", pipeIds: [] };
    expect(buildMetaLine([], ch)).toBe("");
  });
});

describe("channelMidpoint", () => {
  it("returns the geometric midpoint when channel has no bend points", () => {
    const ch: SchemeChannel = {
      id: "ch", fromNodeId: "a", toNodeId: "b", pipeIds: [],
    };
    expect(channelMidpoint(ch, [NODE_A, NODE_B])).toEqual({ x: 100, y: 0 });
  });

  it("returns the midpoint of the central segment when there are bend points", () => {
    const ch: SchemeChannel = {
      id: "ch", fromNodeId: "a", toNodeId: "b", pipeIds: [],
      bendPoints: [{ x: 100, y: 100 }],
    };
    // points = [(0,0), (100,100), (200,0)]
    // midIdx = floor(3/2) = 1 → midpoint of points[0] + points[1] = (50, 50)
    expect(channelMidpoint(ch, [NODE_A, NODE_B])).toEqual({ x: 50, y: 50 });
  });

  it("returns null when endpoint node missing", () => {
    const ch: SchemeChannel = {
      id: "ch", fromNodeId: "a", toNodeId: "missing", pipeIds: [],
    };
    expect(channelMidpoint(ch, [NODE_A])).toBeNull();
  });
});

describe("buildChannelLabel — end-to-end", () => {
  it("assembles a complete label from a channel + pipes", () => {
    const { channel, pipes } = buildChannelFromDraw({
      fromNodeId: "a",
      toNodeId: "b",
      channelType: "Л-9",
      pipeCircuits: ["heating_supply", "heating_return", "dhw_supply", "dhw_recirc", "cold_water"],
      length_m: 85,
    });
    const label = buildChannelLabel(channel, [NODE_A, NODE_B], pipes);
    expect(label).not.toBeNull();
    expect(label!.typeLine).toBe("Л-9 1500×610");
    expect(label!.pipesLine).toBe("Д2.1 Φ100 · Д2.2 Φ100 · Д3 Φ100 · Д4 Φ100 · У1 Φ100");
    expect(label!.metaLine).toBe("L=85.0 м");
    expect(label!.anchorX).toBe(100);
    expect(label!.anchorY).toBe(0);
  });

  it("uses default offset when channel has no labelOffset", () => {
    const ch: SchemeChannel = {
      id: "ch", fromNodeId: "a", toNodeId: "b", pipeIds: [],
    };
    const label = buildChannelLabel(ch, [NODE_A, NODE_B], []);
    expect(label!.offsetDx).toBe(DEFAULT_LABEL_OFFSET.dx);
    expect(label!.offsetDy).toBe(DEFAULT_LABEL_OFFSET.dy);
  });

  it("respects engineer-set labelOffset", () => {
    const ch: SchemeChannel = {
      id: "ch", fromNodeId: "a", toNodeId: "b", pipeIds: [],
      labelOffset: { dx: 100, dy: 50 },
    };
    const label = buildChannelLabel(ch, [NODE_A, NODE_B], []);
    expect(label!.offsetDx).toBe(100);
    expect(label!.offsetDy).toBe(50);
  });
});

describe("isLabelVisible", () => {
  it("per-channel labelVisible=true wins over project showsLabels=false", () => {
    const ch: SchemeChannel = {
      id: "ch", fromNodeId: "a", toNodeId: "b", pipeIds: [], labelVisible: true,
    };
    expect(isLabelVisible(ch, false)).toBe(true);
  });

  it("per-channel labelVisible=false wins over project showsLabels=true", () => {
    const ch: SchemeChannel = {
      id: "ch", fromNodeId: "a", toNodeId: "b", pipeIds: [], labelVisible: false,
    };
    expect(isLabelVisible(ch, true)).toBe(false);
  });

  it("defaults to visible when project setting undefined", () => {
    const ch: SchemeChannel = {
      id: "ch", fromNodeId: "a", toNodeId: "b", pipeIds: [],
    };
    expect(isLabelVisible(ch, undefined)).toBe(true);
  });

  it("respects project showsLabels=false when channel has no override", () => {
    const ch: SchemeChannel = {
      id: "ch", fromNodeId: "a", toNodeId: "b", pipeIds: [],
    };
    expect(isLabelVisible(ch, false)).toBe(false);
  });
});

describe("labelDimensions", () => {
  it("zero-content label has zero size", () => {
    const dims = labelDimensions({
      channelId: "ch", typeLine: "", pipesLine: "", metaLine: "",
      anchorX: 0, anchorY: 0, offsetDx: 0, offsetDy: 0,
    });
    expect(dims).toEqual({ width: 0, height: 0 });
  });

  it("3-line label is taller than 1-line", () => {
    const small = labelDimensions({
      channelId: "ch", typeLine: "Л-9 1500×610", pipesLine: "", metaLine: "",
      anchorX: 0, anchorY: 0, offsetDx: 0, offsetDy: 0,
    });
    const big = labelDimensions({
      channelId: "ch",
      typeLine: "Л-9 1500×610",
      pipesLine: "Д2.1 Φ150 · Д2.2 Φ150 · Д3 Φ100 · Д4 Φ80 · У1 Φ50",
      metaLine: "L=85.0 м · h=1.2 м",
      anchorX: 0, anchorY: 0, offsetDx: 0, offsetDy: 0,
    });
    expect(big.height).toBeGreaterThan(small.height);
  });

  it("width clamps at 380px for very long lines", () => {
    const dims = labelDimensions({
      channelId: "ch",
      typeLine: "x".repeat(200),
      pipesLine: "y".repeat(200),
      metaLine: "z".repeat(200),
      anchorX: 0, anchorY: 0, offsetDx: 0, offsetDy: 0,
    });
    expect(dims.width).toBe(380);
  });
});
