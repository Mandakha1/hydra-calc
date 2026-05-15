/**
 * Phase 12.6 — Cross-section view-model helper tests.
 */
import { describe, it, expect } from "vitest";
import {
  pickChannel,
  layoutPipes,
  buildChannelCrossSection,
  buildChannelDetail,
  mmToPx,
  tempBadge,
  CIRCUIT_FILLS,
  BOTTOM_CLEARANCE_MM,
} from "../channelCrossSection";
import { buildChannelFromDraw } from "../channelOperations";
import type { SchemeChannel, SchemePipe } from "../../hydraulicTypes";

describe("pickChannel — selection priority", () => {
  it("returns first channel when no selection", () => {
    const channels: SchemeChannel[] = [
      { id: "ch_1", fromNodeId: "a", toNodeId: "b", pipeIds: [] },
      { id: "ch_2", fromNodeId: "c", toNodeId: "d", pipeIds: [] },
    ];
    expect(pickChannel(channels, [], null)?.id).toBe("ch_1");
  });

  it("returns the channel containing the selected pipe", () => {
    const channels: SchemeChannel[] = [
      { id: "ch_1", fromNodeId: "a", toNodeId: "b", pipeIds: ["p1"] },
      { id: "ch_2", fromNodeId: "c", toNodeId: "d", pipeIds: ["p2"] },
    ];
    const pipes: SchemePipe[] = [
      { id: "p1", fromNodeId: "a", toNodeId: "b", materialKey: "steel_aged", dn: 100, length_m: 10, channelId: "ch_1" },
      { id: "p2", fromNodeId: "c", toNodeId: "d", materialKey: "steel_aged", dn: 100, length_m: 10, channelId: "ch_2" },
    ];
    expect(
      pickChannel(channels, pipes, { kind: "pipe", id: "p2" })?.id,
    ).toBe("ch_2");
  });

  it("falls back to first channel when selection is a stand-alone pipe", () => {
    const channels: SchemeChannel[] = [
      { id: "ch_1", fromNodeId: "a", toNodeId: "b", pipeIds: [] },
    ];
    const pipes: SchemePipe[] = [
      { id: "p_orphan", fromNodeId: "a", toNodeId: "b", materialKey: "steel_aged", dn: 100, length_m: 10 },
    ];
    expect(
      pickChannel(channels, pipes, { kind: "pipe", id: "p_orphan" })?.id,
    ).toBe("ch_1");
  });

  it("returns null when no channels exist", () => {
    expect(pickChannel([], [], null)).toBeNull();
  });
});

describe("layoutPipes — canonical bottom-row spacing", () => {
  function makePipe(circuit: string, dn: number = 100, id: string = "p"): SchemePipe {
    return {
      id,
      fromNodeId: "a",
      toNodeId: "b",
      materialKey: "steel_aged",
      dn,
      length_m: 10,
      circuit: circuit as SchemePipe["circuit"],
    };
  }

  it("4-pipe Л-7 (1200 mm) → pipes at 240 / 480 / 720 / 960 mm", () => {
    const pipes = [
      makePipe("heating_supply", 100, "p1"),
      makePipe("heating_return", 100, "p2"),
      makePipe("dhw_supply", 80, "p3"),
      makePipe("dhw_recirc", 80, "p4"),
    ];
    const layout = layoutPipes(1200, 580, pipes);
    expect(layout).toHaveLength(4);
    expect(layout[0]!.centerX_mm).toBeCloseTo(240, 1);
    expect(layout[1]!.centerX_mm).toBeCloseTo(480, 1);
    expect(layout[2]!.centerX_mm).toBeCloseTo(720, 1);
    expect(layout[3]!.centerX_mm).toBeCloseTo(960, 1);
  });

  it("5-pipe Л-9 (1500 mm) → equal 250 mm gutters", () => {
    const pipes = [
      makePipe("heating_supply", 150, "p1"),
      makePipe("heating_return", 150, "p2"),
      makePipe("dhw_supply", 100, "p3"),
      makePipe("dhw_recirc", 80, "p4"),
      makePipe("cold_water", 50, "p5"),
    ];
    const layout = layoutPipes(1500, 610, pipes);
    expect(layout).toHaveLength(5);
    expect(layout[0]!.centerX_mm).toBeCloseTo(250, 1);
    expect(layout[4]!.centerX_mm).toBeCloseTo(1250, 1);
  });

  it("orders pipes canonically regardless of input order", () => {
    const pipes = [
      makePipe("cold_water", 50, "p_У1"),
      makePipe("dhw_supply", 80, "p_D3"),
      makePipe("heating_supply", 100, "p_D21"),
      makePipe("heating_return", 100, "p_D22"),
    ];
    const layout = layoutPipes(1200, 580, pipes);
    expect(layout.map((p) => p.code)).toEqual(["D2.1", "D2.2", "D3", "У1"]);
  });

  it("radius = DN / 2 (DN-as-OD approximation)", () => {
    const pipes = [makePipe("heating_supply", 150, "p1")];
    const layout = layoutPipes(600, 450, pipes);
    expect(layout[0]!.radius_mm).toBe(75);
  });

  it("all pipes sit at BOTTOM_CLEARANCE_MM above the channel floor", () => {
    const pipes = [
      makePipe("heating_supply", 100, "p1"),
      makePipe("heating_return", 100, "p2"),
    ];
    const layout = layoutPipes(600, 450, pipes);
    expect(layout.every((p) => p.centerY_mm === BOTTOM_CLEARANCE_MM)).toBe(true);
  });

  it("assigns correct circuit fill colours", () => {
    const pipes = [
      makePipe("heating_supply", 100, "p1"),
      makePipe("heating_return", 100, "p2"),
      makePipe("dhw_supply", 80, "p3"),
      makePipe("dhw_recirc", 80, "p4"),
      makePipe("cold_water", 50, "p5"),
    ];
    const layout = layoutPipes(1500, 610, pipes);
    expect(layout[0]!.fill).toBe(CIRCUIT_FILLS.heating_supply);
    expect(layout[1]!.fill).toBe(CIRCUIT_FILLS.heating_return);
    expect(layout[2]!.fill).toBe(CIRCUIT_FILLS.dhw_supply);
    expect(layout[3]!.fill).toBe(CIRCUIT_FILLS.dhw_recirc);
    expect(layout[4]!.fill).toBe(CIRCUIT_FILLS.cold_water);
  });

  it("assigns 95 / 70 / 60 / 60 / null °C temperatures", () => {
    const pipes = [
      makePipe("heating_supply", 100, "p1"),
      makePipe("heating_return", 100, "p2"),
      makePipe("dhw_supply", 80, "p3"),
      makePipe("dhw_recirc", 80, "p4"),
      makePipe("cold_water", 50, "p5"),
    ];
    const layout = layoutPipes(1500, 610, pipes);
    expect(layout[0]!.tempC).toBe(95);
    expect(layout[1]!.tempC).toBe(70);
    expect(layout[2]!.tempC).toBe(60);
    expect(layout[3]!.tempC).toBe(60);
    expect(layout[4]!.tempC).toBeNull();
  });

  it("returns [] for zero pipes", () => {
    expect(layoutPipes(1200, 580, [])).toEqual([]);
  });

  it("returns [] when channel width is 0", () => {
    const pipes = [makePipe("heating_supply", 100, "p1")];
    expect(layoutPipes(0, 580, pipes)).toEqual([]);
  });

  it("legacy pipe without circuit ends up at the rear with grey fill", () => {
    const pipes: SchemePipe[] = [
      // No circuit (Phase 6 legacy)
      { id: "p_legacy", fromNodeId: "a", toNodeId: "b", materialKey: "steel_aged", dn: 100, length_m: 10 },
      makePipe("heating_supply", 100, "p1"),
    ];
    const layout = layoutPipes(1200, 580, pipes);
    expect(layout[0]!.pipeId).toBe("p1");
    expect(layout[1]!.pipeId).toBe("p_legacy");
    expect(layout[1]!.fill).toBe("#7F8C8D");
  });
});

describe("buildChannelCrossSection — end-to-end", () => {
  it("falls back to CHANNEL_TYPE_REGISTRY when crossSection* fields missing", () => {
    const channel: SchemeChannel = {
      id: "ch_1",
      fromNodeId: "a",
      toNodeId: "b",
      pipeIds: [],
      channelType: "Л-9",
      // No crossSectionWidth_mm / crossSectionHeight_mm
    };
    const view = buildChannelCrossSection(channel, []);
    expect(view.width_mm).toBe(1500);
    expect(view.height_mm).toBe(610);
    expect(view.typeLabel).toBe("Л-9 (1500×610)");
  });

  it("respects explicit crossSection* fields over registry defaults", () => {
    const channel: SchemeChannel = {
      id: "ch_1",
      fromNodeId: "a",
      toNodeId: "b",
      pipeIds: [],
      channelType: "Л-4",
      crossSectionWidth_mm: 700,
      crossSectionHeight_mm: 500,
    };
    const view = buildChannelCrossSection(channel, []);
    expect(view.width_mm).toBe(700);
    expect(view.height_mm).toBe(500);
  });

  it("custom channel exposes the engineer-supplied dimensions", () => {
    const channel: SchemeChannel = {
      id: "ch_1",
      fromNodeId: "a",
      toNodeId: "b",
      pipeIds: [],
      channelType: "custom",
      crossSectionWidth_mm: 850,
      crossSectionHeight_mm: 520,
    };
    const view = buildChannelCrossSection(channel, []);
    expect(view.width_mm).toBe(850);
    expect(view.height_mm).toBe(520);
    expect(view.typeLabel).toBe("Сонголтоор (850×520)");
  });

  it("end-to-end via buildChannelFromDraw → expected canonical layout", () => {
    const { channel, pipes } = buildChannelFromDraw({
      fromNodeId: "a",
      toNodeId: "b",
      channelType: "Л-9",
      pipeCircuits: ["heating_supply", "heating_return", "dhw_supply", "dhw_recirc", "cold_water"],
      length_m: 50,
    });
    const view = buildChannelCrossSection(channel, pipes);
    expect(view.width_mm).toBe(1500);
    expect(view.height_mm).toBe(610);
    expect(view.pipeCount).toBe(5);
    expect(view.pipes.map((p) => p.code)).toEqual(["D2.1", "D2.2", "D3", "D4", "У1"]);
  });
});

describe("buildChannelDetail — selection routing + error states", () => {
  it("returns error when no channels exist", () => {
    const result = buildChannelDetail(undefined, [], null);
    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error).toMatch(/Сүлжээнд суваг/);
    }
  });

  it("returns error when channels is empty array", () => {
    const result = buildChannelDetail([], [], null);
    expect("error" in result).toBe(true);
  });

  it("uses pipe-selection to pick the right channel", () => {
    const draw1 = buildChannelFromDraw({
      fromNodeId: "a",
      toNodeId: "b",
      channelType: "Л-4",
      pipeCircuits: ["heating_supply", "heating_return"],
      length_m: 20,
    });
    const draw2 = buildChannelFromDraw({
      fromNodeId: "c",
      toNodeId: "d",
      channelType: "Л-9",
      pipeCircuits: ["heating_supply", "heating_return", "dhw_supply"],
      length_m: 50,
    });
    const result = buildChannelDetail(
      [draw1.channel, draw2.channel],
      [...draw1.pipes, ...draw2.pipes],
      { kind: "pipe", id: draw2.pipes[1]!.id },
    );
    expect("channelId" in result).toBe(true);
    if ("channelId" in result) {
      expect(result.channelId).toBe(draw2.channel.id);
      expect(result.width_mm).toBe(1500);
    }
  });
});

describe("mmToPx + tempBadge utilities", () => {
  it("mmToPx multiplies by scale", () => {
    expect(mmToPx(1500, 0.2)).toBe(300);
    expect(mmToPx(100, 0.5)).toBe(50);
  });

  it("tempBadge formats temperature with °C", () => {
    expect(tempBadge(95)).toBe("95 °C");
    expect(tempBadge(60)).toBe("60 °C");
  });

  it("tempBadge returns null for control / cold lines", () => {
    expect(tempBadge(null)).toBeNull();
  });
});
