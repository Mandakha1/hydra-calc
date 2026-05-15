/**
 * Phase 12.10 — Channel BoM tests.
 *
 * Covers the new composite-channel line items (concrete section,
 * sleepers, insulation) emitted by generateBom() when SchemeChannel
 * entities are present in HydraulicState.
 */
import { describe, it, expect } from "vitest";
import { channelBoMLines, generateBom } from "../bom";
import { emptyState, type HydraulicState, type SchemeChannel, type SchemePipe } from "../../hydraulicTypes";
import { buildChannelFromDraw } from "../../scheme/channelOperations";

function pipe(over: Partial<SchemePipe>): SchemePipe {
  return {
    id: "p",
    fromNodeId: "a",
    toNodeId: "b",
    materialKey: "steel_aged",
    dn: 100,
    length_m: 10,
    ...over,
  };
}

function channel(over: Partial<SchemeChannel> = {}): SchemeChannel {
  return {
    id: "ch",
    type: "channel",
    fromNodeId: "a",
    toNodeId: "b",
    pipeIds: [],
    channelType: "Л-7",
    crossSectionWidth_mm: 1200,
    crossSectionHeight_mm: 580,
    ...over,
  };
}

describe("channelBoMLines — per-channel line items", () => {
  it("returns concrete + sleeper + insulation lines for a Л-7 channel", () => {
    const ch = channel({
      pipeIds: ["p1", "p2"],
    });
    const pipes = [pipe({ id: "p1", length_m: 30 }), pipe({ id: "p2", length_m: 30 })];
    const lines = channelBoMLines(ch, pipes);
    expect(lines).toHaveLength(3);
    expect(lines[0]!.name).toMatch(/Бетон суваг Л-7/);
    expect(lines[1]!.name).toMatch(/тулгуур блок/);
    expect(lines[2]!.name).toMatch(/дулаалга/);
  });

  it("concrete line: quantity = pipe length, unit = м, total = length × price", () => {
    const ch = channel({ pipeIds: ["p1"], channelType: "Л-7" });
    const pipes = [pipe({ id: "p1", length_m: 50 })];
    const [concrete] = channelBoMLines(ch, pipes);
    expect(concrete!.quantity).toBe(50);
    expect(concrete!.unit).toBe("м");
    expect(concrete!.unitPrice_mnt).toBe(140_000); // Л-7
    expect(concrete!.totalPrice_mnt).toBe(50 * 140_000);
  });

  it("Л-9 priced higher than Л-7 (main trunk vs medium)", () => {
    const l9 = channel({ pipeIds: ["p"], channelType: "Л-9", crossSectionWidth_mm: 1500, crossSectionHeight_mm: 610 });
    const l7 = channel({ pipeIds: ["p"], channelType: "Л-7", crossSectionWidth_mm: 1200, crossSectionHeight_mm: 580 });
    const pipes = [pipe({ id: "p", length_m: 20 })];
    const [l9Concrete] = channelBoMLines(l9, pipes);
    const [l7Concrete] = channelBoMLines(l7, pipes);
    expect(l9Concrete!.totalPrice_mnt).toBeGreaterThan(l7Concrete!.totalPrice_mnt);
  });

  it("sleeper count = ceil(length / 2.5) with minimum 2", () => {
    const ch = channel({ pipeIds: ["p1"] });
    // 10 m channel → ceil(10/2.5) = 4 sleepers
    let lines = channelBoMLines(ch, [pipe({ id: "p1", length_m: 10 })]);
    expect(lines[1]!.quantity).toBe(4);
    // 3 m channel → ceil(3/2.5) = 2 sleepers (matches min)
    lines = channelBoMLines(ch, [pipe({ id: "p1", length_m: 3 })]);
    expect(lines[1]!.quantity).toBe(2);
    // 0.5 m channel → minimum 2 (not 1)
    lines = channelBoMLines(ch, [pipe({ id: "p1", length_m: 0.5 })]);
    expect(lines[1]!.quantity).toBe(2);
  });

  it("insulation area = perimeter × length / 1000", () => {
    // Л-7 1200×580 mm → perimeter = (1200+580)×2 = 3560 mm = 3.56 m
    // 50 m channel → 3.56 × 50 = 178 m²
    const ch = channel({ pipeIds: ["p1"], channelType: "Л-7" });
    const pipes = [pipe({ id: "p1", length_m: 50 })];
    const insulation = channelBoMLines(ch, pipes)[2]!;
    expect(insulation.quantity).toBeCloseTo(178, 1);
    expect(insulation.unit).toBe("м²");
  });

  it("returns [] for zero-length channel", () => {
    const ch = channel({ pipeIds: [] });
    expect(channelBoMLines(ch, [])).toEqual([]);
  });

  it("custom channel uses 'custom' price + engineer-supplied dimensions", () => {
    const ch = channel({
      pipeIds: ["p1"],
      channelType: "custom",
      crossSectionWidth_mm: 900,
      crossSectionHeight_mm: 500,
    });
    const pipes = [pipe({ id: "p1", length_m: 20 })];
    const lines = channelBoMLines(ch, pipes);
    expect(lines[0]!.name).toMatch(/Сонголтоор 900×500/);
    expect(lines[0]!.unitPrice_mnt).toBe(120_000); // custom price
    // perimeter = (900+500)×2 = 2800 mm = 2.8 m, area = 56 m²
    expect(lines[2]!.quantity).toBeCloseTo(56, 1);
  });

  it("falls back to registry dimensions when channel.crossSection* missing", () => {
    const ch = channel({
      pipeIds: ["p1"],
      channelType: "Л-9",
      // no crossSectionWidth_mm / crossSectionHeight_mm
      crossSectionWidth_mm: undefined,
      crossSectionHeight_mm: undefined,
    });
    const pipes = [pipe({ id: "p1", length_m: 10 })];
    const lines = channelBoMLines(ch, pipes);
    expect(lines[0]!.name).toMatch(/1500×610/);
  });

  it("source string mentions ГК-23/02 + pipe count", () => {
    const ch = channel({ pipeIds: ["p1", "p2", "p3"] });
    const pipes = [
      pipe({ id: "p1", length_m: 10 }),
      pipe({ id: "p2", length_m: 10 }),
      pipe({ id: "p3", length_m: 10 }),
    ];
    const concrete = channelBoMLines(ch, pipes)[0]!;
    expect(concrete.source).toMatch(/ГК-23\/02/);
    expect(concrete.source).toMatch(/3п/);
  });
});

describe("generateBom — channel integration", () => {
  it("emits channel lines when state.channels is non-empty", () => {
    const state: HydraulicState = emptyState();
    const draw = buildChannelFromDraw({
      fromNodeId: "n1",
      toNodeId: "n2",
      channelType: "Л-7",
      pipeCircuits: ["heating_supply", "heating_return", "dhw_supply", "dhw_recirc"],
      length_m: 40,
    });
    state.channels = [draw.channel];
    state.pipes = draw.pipes;
    const bom = generateBom(state);
    const materialLines = bom.lines.filter((l) => l.category === "material");
    expect(materialLines.length).toBeGreaterThanOrEqual(3);
    expect(materialLines.some((l) => l.name.includes("Бетон суваг"))).toBe(true);
    expect(materialLines.some((l) => l.name.includes("дулаалга"))).toBe(true);
  });

  it("byCategory exposes a 'material' subtotal for channels", () => {
    const state: HydraulicState = emptyState();
    const draw = buildChannelFromDraw({
      fromNodeId: "n1",
      toNodeId: "n2",
      channelType: "Л-9",
      pipeCircuits: ["heating_supply", "heating_return", "dhw_supply", "dhw_recirc", "cold_water"],
      length_m: 85,
    });
    state.channels = [draw.channel];
    state.pipes = draw.pipes;
    const bom = generateBom(state);
    expect(bom.byCategory.material).toBeGreaterThan(0);
  });

  it("legacy projects without channels still produce a valid BoM", () => {
    const state: HydraulicState = emptyState();
    const bom = generateBom(state);
    expect(bom.lines.filter((l) => l.category === "material")).toEqual([]);
  });

  it("multi-channel project sums concrete totals correctly", () => {
    const state: HydraulicState = emptyState();
    const ch1 = buildChannelFromDraw({
      fromNodeId: "n1", toNodeId: "n2", channelType: "Л-4",
      pipeCircuits: ["heating_supply", "heating_return"], length_m: 20,
    });
    const ch2 = buildChannelFromDraw({
      fromNodeId: "n2", toNodeId: "n3", channelType: "Л-7",
      pipeCircuits: ["heating_supply", "heating_return", "dhw_supply", "dhw_recirc"], length_m: 40,
    });
    state.channels = [ch1.channel, ch2.channel];
    state.pipes = [...ch1.pipes, ...ch2.pipes];
    const bom = generateBom(state);
    const concreteLines = bom.lines.filter((l) => l.name.includes("Бетон суваг"));
    expect(concreteLines).toHaveLength(2);
    // Л-4 20m × 85_000 + Л-7 40m × 140_000 = 1_700_000 + 5_600_000 = 7_300_000
    const concreteTotal = concreteLines.reduce((s, l) => s + l.totalPrice_mnt, 0);
    expect(concreteTotal).toBe(20 * 85_000 + 40 * 140_000);
  });

  it("total_mnt includes the channel materials in VAT / labor / transport calc", () => {
    const stateNoChannel: HydraulicState = emptyState();
    const bomNoChannel = generateBom(stateNoChannel);

    const stateWithChannel: HydraulicState = emptyState();
    const draw = buildChannelFromDraw({
      fromNodeId: "n1", toNodeId: "n2", channelType: "Л-7",
      pipeCircuits: ["heating_supply", "heating_return"], length_m: 50,
    });
    stateWithChannel.channels = [draw.channel];
    stateWithChannel.pipes = draw.pipes;
    const bomWithChannel = generateBom(stateWithChannel);

    expect(bomWithChannel.total_mnt).toBeGreaterThan(bomNoChannel.total_mnt);
    expect(bomWithChannel.vat_mnt).toBeGreaterThan(bomNoChannel.vat_mnt);
  });
});
