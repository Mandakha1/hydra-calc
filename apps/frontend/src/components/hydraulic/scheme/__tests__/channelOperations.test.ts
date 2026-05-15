/**
 * Phase 12.5 — Composite pipe channel CRUD tests.
 *
 * Covers the four pure helpers in channelOperations.ts that wrap the
 * SchemeChannel + contained SchemePipe lifecycle. The store actions /
 * SchemeEditor render layer wrap these in pushUndoSnapshot for atomic
 * undo/redo; tests below exercise the pure data transformations only.
 *
 * Reference: ГК-23/02 СЕРИЯ Г-991-1 — dimensions must match GK_DATA.json.
 */
import { describe, it, expect } from "vitest";
import {
  buildChannelFromDraw,
  convertPipeToChannel,
  addPipeToChannel,
  removePipeFromChannel,
  channelPipeCountBadge,
  containedPipes,
} from "../channelOperations";
import {
  CHANNEL_TYPE_REGISTRY,
  CIRCUIT_DEFAULTS,
  circuitDefault,
  channelTypeLabel,
  channelDimensions,
} from "../channelTypes";
import type { SchemeChannel, SchemePipe } from "../../hydraulicTypes";
import type { PipeCircuit } from "../../nodeCatalog";

/* ─── buildChannelFromDraw ─────────────────────────────────────── */

describe("buildChannelFromDraw — Phase 12.5", () => {
  it("creates a Л-4 channel + 2 pipes (D2.1 + D2.2) from a basic draw action", () => {
    const result = buildChannelFromDraw({
      fromNodeId: "n1",
      toNodeId: "n2",
      channelType: "Л-4",
      pipeCircuits: ["heating_supply", "heating_return"],
      length_m: 25,
    });

    expect(result.channel.channelType).toBe("Л-4");
    expect(result.channel.fromNodeId).toBe("n1");
    expect(result.channel.toNodeId).toBe("n2");
    expect(result.channel.crossSectionWidth_mm).toBe(600);
    expect(result.channel.crossSectionHeight_mm).toBe(450);
    expect(result.pipes).toHaveLength(2);
    expect(result.channel.pipeIds).toHaveLength(2);
    expect(result.pipes.every((p) => p.length_m === 25)).toBe(true);
    expect(result.pipes.every((p) => p.fromNodeId === "n1" && p.toNodeId === "n2")).toBe(true);
  });

  it("creates a Л-9 channel + 5 pipes in canonical CIRCUIT_DEFAULTS order", () => {
    // Pass circuits in DELIBERATELY shuffled order — output must still
    // be canonical (D2.1 / D2.2 / D3 / D4 / У1)
    const result = buildChannelFromDraw({
      fromNodeId: "n1",
      toNodeId: "n2",
      channelType: "Л-9",
      pipeCircuits: ["cold_water", "dhw_recirc", "heating_supply", "dhw_supply", "heating_return"],
      length_m: 100,
    });

    expect(result.pipes).toHaveLength(5);
    const circuits = result.pipes.map((p) => p.circuit);
    expect(circuits).toEqual([
      "heating_supply",
      "heating_return",
      "dhw_supply",
      "dhw_recirc",
      "cold_water",
    ]);
  });

  it("Л-7 dimensions match GK_DATA.json exactly (1200×580)", () => {
    const result = buildChannelFromDraw({
      fromNodeId: "n1",
      toNodeId: "n2",
      channelType: "Л-7",
      pipeCircuits: ["heating_supply", "heating_return", "dhw_supply", "dhw_recirc"],
      length_m: 50,
    });
    expect(result.channel.crossSectionWidth_mm).toBe(1200);
    expect(result.channel.crossSectionHeight_mm).toBe(580);
  });

  it("Л-9 dimensions match GK_DATA.json exactly (1500×610)", () => {
    const result = buildChannelFromDraw({
      fromNodeId: "n1",
      toNodeId: "n2",
      channelType: "Л-9",
      pipeCircuits: ["heating_supply"],
      length_m: 50,
    });
    expect(result.channel.crossSectionWidth_mm).toBe(1500);
    expect(result.channel.crossSectionHeight_mm).toBe(610);
  });

  it("custom channelType uses engineer-supplied dimensions", () => {
    const result = buildChannelFromDraw({
      fromNodeId: "n1",
      toNodeId: "n2",
      channelType: "custom",
      customWidth_mm: 850,
      customHeight_mm: 500,
      pipeCircuits: ["heating_supply", "heating_return"],
      length_m: 30,
    });
    expect(result.channel.channelType).toBe("custom");
    expect(result.channel.crossSectionWidth_mm).toBe(850);
    expect(result.channel.crossSectionHeight_mm).toBe(500);
  });

  it("custom channelType without dimensions defaults to 0×0 (engineer must fill in)", () => {
    const result = buildChannelFromDraw({
      fromNodeId: "n1",
      toNodeId: "n2",
      channelType: "custom",
      pipeCircuits: ["heating_supply"],
      length_m: 10,
    });
    expect(result.channel.crossSectionWidth_mm).toBe(0);
    expect(result.channel.crossSectionHeight_mm).toBe(0);
  });

  it("bendPoints propagate to channel + every contained pipe", () => {
    const bendPoints = [
      { x: 50, y: 30 },
      { x: 150, y: 30 },
    ];
    const result = buildChannelFromDraw({
      fromNodeId: "n1",
      toNodeId: "n2",
      channelType: "Л-4",
      bendPoints,
      pipeCircuits: ["heating_supply", "heating_return"],
      length_m: 40,
    });
    expect(result.channel.bendPoints).toEqual(bendPoints);
    expect(result.pipes[0]!.bendPoints).toEqual(bendPoints);
    expect(result.pipes[1]!.bendPoints).toEqual(bendPoints);
  });

  it("anglePolicy propagates to channel + every contained pipe", () => {
    const result = buildChannelFromDraw({
      fromNodeId: "n1",
      toNodeId: "n2",
      channelType: "Л-4",
      anglePolicy: "snap_90",
      pipeCircuits: ["heating_supply", "heating_return"],
      length_m: 20,
    });
    expect(result.channel.anglePolicy).toBe("snap_90");
    expect(result.pipes.every((p) => p.anglePolicy === "snap_90")).toBe(true);
  });

  it("contained pipes all reference the parent channel via channelId", () => {
    const result = buildChannelFromDraw({
      fromNodeId: "n1",
      toNodeId: "n2",
      channelType: "Л-7",
      pipeCircuits: ["heating_supply", "heating_return", "dhw_supply"],
      length_m: 35,
    });
    expect(result.pipes.every((p) => p.channelId === result.channel.id)).toBe(true);
  });

  it("channel.pipeIds preserves the canonical order matching pipes[].id", () => {
    const result = buildChannelFromDraw({
      fromNodeId: "n1",
      toNodeId: "n2",
      channelType: "Л-9",
      pipeCircuits: ["cold_water", "heating_supply", "heating_return"],
      length_m: 60,
    });
    expect(result.channel.pipeIds).toEqual(result.pipes.map((p) => p.id));
  });

  it("default DN + materialKey when not supplied", () => {
    const result = buildChannelFromDraw({
      fromNodeId: "n1",
      toNodeId: "n2",
      channelType: "Л-4",
      pipeCircuits: ["heating_supply", "heating_return"],
      length_m: 15,
    });
    expect(result.pipes.every((p) => p.dn === 100)).toBe(true);
    expect(result.pipes.every((p) => p.materialKey === "steel_aged")).toBe(true);
  });

  it("respects custom defaultDn + defaultMaterialKey", () => {
    const result = buildChannelFromDraw({
      fromNodeId: "n1",
      toNodeId: "n2",
      channelType: "Л-7",
      pipeCircuits: ["heating_supply", "heating_return"],
      defaultDn: 150,
      defaultMaterialKey: "ppr_fr",
      length_m: 20,
    });
    expect(result.pipes.every((p) => p.dn === 150)).toBe(true);
    expect(result.pipes.every((p) => p.materialKey === "ppr_fr")).toBe(true);
  });

  it("single-circuit channel is valid (e.g. retrofit with only D2.1)", () => {
    const result = buildChannelFromDraw({
      fromNodeId: "n1",
      toNodeId: "n2",
      channelType: "Л-4",
      pipeCircuits: ["heating_supply"],
      length_m: 12,
    });
    expect(result.pipes).toHaveLength(1);
    expect(result.pipes[0]!.circuit).toBe("heating_supply");
  });

  it("channel discriminant type is 'channel'", () => {
    const result = buildChannelFromDraw({
      fromNodeId: "n1",
      toNodeId: "n2",
      channelType: "Л-4",
      pipeCircuits: ["heating_supply", "heating_return"],
      length_m: 20,
    });
    expect(result.channel.type).toBe("channel");
  });
});

/* ─── convertPipeToChannel ─────────────────────────────────────── */

describe("convertPipeToChannel — Phase 12.5", () => {
  function makePipe(over: Partial<SchemePipe> = {}): SchemePipe {
    return {
      id: "p_existing",
      fromNodeId: "n1",
      toNodeId: "n2",
      materialKey: "steel_aged",
      dn: 100,
      length_m: 30,
      circuit: "heating_supply",
      ...over,
    };
  }

  it("creates a channel anchored to the existing pipe's endpoints", () => {
    const existingPipe = makePipe();
    const result = convertPipeToChannel({
      existingPipe,
      channelType: "Л-7",
      additionalCircuits: ["heating_return", "dhw_supply"],
    });
    expect(result.channel.fromNodeId).toBe("n1");
    expect(result.channel.toNodeId).toBe("n2");
    expect(result.channel.channelType).toBe("Л-7");
    expect(result.channel.crossSectionWidth_mm).toBe(1200);
    expect(result.channel.crossSectionHeight_mm).toBe(580);
  });

  it("preserves the existing pipe (no new pipe for its circuit)", () => {
    const existingPipe = makePipe();
    const result = convertPipeToChannel({
      existingPipe,
      channelType: "Л-7",
      additionalCircuits: ["heating_return", "dhw_supply"],
    });
    // 2 additional pipes (heating_supply already exists, so it's skipped)
    expect(result.additionalPipes).toHaveLength(2);
    const newCircuits = result.additionalPipes.map((p) => p.circuit);
    expect(newCircuits).toContain("heating_return");
    expect(newCircuits).toContain("dhw_supply");
    expect(newCircuits).not.toContain("heating_supply");
  });

  it("skips additionalCircuits entries duplicating the existing pipe's circuit", () => {
    const existingPipe = makePipe({ circuit: "heating_supply" });
    const result = convertPipeToChannel({
      existingPipe,
      channelType: "Л-7",
      additionalCircuits: ["heating_supply", "heating_return"],
    });
    // heating_supply de-duped against the existing pipe → only 1 added
    expect(result.additionalPipes).toHaveLength(1);
    expect(result.additionalPipes[0]!.circuit).toBe("heating_return");
  });

  it("pipePatch back-references the channel via channelId", () => {
    const existingPipe = makePipe();
    const result = convertPipeToChannel({
      existingPipe,
      channelType: "Л-4",
      additionalCircuits: ["heating_return"],
    });
    expect(result.pipePatch.id).toBe("p_existing");
    expect(result.pipePatch.channelId).toBe(result.channel.id);
  });

  it("pipeIds order: existing first, then additional in canonical sequence", () => {
    const existingPipe = makePipe({ circuit: "dhw_supply" });
    const result = convertPipeToChannel({
      existingPipe,
      channelType: "Л-9",
      additionalCircuits: ["heating_supply", "cold_water", "heating_return", "dhw_recirc"],
    });
    // Resulting pipes in canonical order: D2.1 / D2.2 / D3 / D4 / У1
    // existing is D3 → orderedPipeIds should still pull from CIRCUIT_DEFAULTS sequence
    const allPipes = [existingPipe, ...result.additionalPipes];
    const canonicalIds = CIRCUIT_DEFAULTS.map((c) => c.circuit)
      .map((c) => allPipes.find((p) => p.circuit === c)?.id)
      .filter((id): id is string => typeof id === "string");
    expect(result.channel.pipeIds).toEqual(canonicalIds);
  });

  it("inherits bendPoints + anglePolicy from existing pipe", () => {
    const bendPoints = [{ x: 100, y: 50 }, { x: 200, y: 50 }];
    const existingPipe = makePipe({ bendPoints, anglePolicy: "snap_45" });
    const result = convertPipeToChannel({
      existingPipe,
      channelType: "Л-4",
      additionalCircuits: ["heating_return"],
    });
    expect(result.channel.bendPoints).toEqual(bendPoints);
    expect(result.channel.anglePolicy).toBe("snap_45");
    // Additional pipes also inherit the geometry
    expect(result.additionalPipes[0]!.bendPoints).toEqual(bendPoints);
    expect(result.additionalPipes[0]!.anglePolicy).toBe("snap_45");
  });

  it("additional pipes inherit length_m from existing pipe", () => {
    const existingPipe = makePipe({ length_m: 42.5 });
    const result = convertPipeToChannel({
      existingPipe,
      channelType: "Л-7",
      additionalCircuits: ["heating_return", "dhw_supply"],
    });
    expect(result.additionalPipes.every((p) => p.length_m === 42.5)).toBe(true);
  });

  it("additional pipes default DN + material to existing pipe's values", () => {
    const existingPipe = makePipe({ dn: 150, materialKey: "ppr_fr" });
    const result = convertPipeToChannel({
      existingPipe,
      channelType: "Л-7",
      additionalCircuits: ["heating_return"],
    });
    expect(result.additionalPipes[0]!.dn).toBe(150);
    expect(result.additionalPipes[0]!.materialKey).toBe("ppr_fr");
  });

  it("custom channelType respects engineer-supplied dims", () => {
    const existingPipe = makePipe();
    const result = convertPipeToChannel({
      existingPipe,
      channelType: "custom",
      customWidth_mm: 1100,
      customHeight_mm: 700,
      additionalCircuits: ["heating_return"],
    });
    expect(result.channel.crossSectionWidth_mm).toBe(1100);
    expect(result.channel.crossSectionHeight_mm).toBe(700);
  });
});

/* ─── addPipeToChannel ─────────────────────────────────────────── */

describe("addPipeToChannel — Phase 12.5", () => {
  function makeChannel(over: Partial<SchemeChannel> = {}): SchemeChannel {
    return {
      id: "ch_1",
      type: "channel",
      fromNodeId: "n1",
      toNodeId: "n2",
      channelType: "Л-7",
      crossSectionWidth_mm: 1200,
      crossSectionHeight_mm: 580,
      pipeIds: ["p1", "p2"],
      ...over,
    };
  }
  function makePipe(over: Partial<SchemePipe> = {}): SchemePipe {
    return {
      id: "p1",
      fromNodeId: "n1",
      toNodeId: "n2",
      materialKey: "steel_aged",
      dn: 100,
      length_m: 30,
      circuit: "heating_supply",
      channelId: "ch_1",
      ...over,
    };
  }

  it("returns a new pipe + channel patch with updated pipeIds", () => {
    const channel = makeChannel();
    const existingPipes = [
      makePipe({ id: "p1", circuit: "heating_supply" }),
      makePipe({ id: "p2", circuit: "heating_return" }),
    ];
    const result = addPipeToChannel({
      channel,
      existingPipes,
      newCircuit: "dhw_supply",
      length_m: 30,
    });
    expect(result.newPipe.circuit).toBe("dhw_supply");
    expect(result.newPipe.channelId).toBe("ch_1");
    expect(result.channelPatch.id).toBe("ch_1");
    expect(result.channelPatch.pipeIds).toHaveLength(3);
    expect(result.channelPatch.pipeIds).toContain(result.newPipe.id);
  });

  it("new pipe shares fromNodeId/toNodeId with channel", () => {
    const channel = makeChannel({ fromNodeId: "nA", toNodeId: "nB" });
    const existingPipes = [makePipe({ id: "p1" })];
    const result = addPipeToChannel({
      channel,
      existingPipes,
      newCircuit: "dhw_supply",
      length_m: 25,
    });
    expect(result.newPipe.fromNodeId).toBe("nA");
    expect(result.newPipe.toNodeId).toBe("nB");
  });

  it("new pipe inherits bendPoints + anglePolicy from channel", () => {
    const bendPoints = [{ x: 80, y: 40 }];
    const channel = makeChannel({ bendPoints, anglePolicy: "snap_90" });
    const existingPipes = [makePipe({ id: "p1" })];
    const result = addPipeToChannel({
      channel,
      existingPipes,
      newCircuit: "dhw_supply",
      length_m: 20,
    });
    expect(result.newPipe.bendPoints).toEqual(bendPoints);
    expect(result.newPipe.anglePolicy).toBe("snap_90");
  });

  it("pipeIds re-ordered to canonical CIRCUIT_DEFAULTS sequence", () => {
    // Start with D2.1 + D2.2 + У1; insert D3 → expected canonical order
    // is D2.1, D2.2, D3, У1 (D4 missing in middle).
    const p1 = makePipe({ id: "p1", circuit: "heating_supply" });
    const p2 = makePipe({ id: "p2", circuit: "heating_return" });
    const p3 = makePipe({ id: "p3", circuit: "cold_water" });
    const channel = makeChannel({ pipeIds: ["p1", "p2", "p3"] });
    const result = addPipeToChannel({
      channel,
      existingPipes: [p1, p2, p3],
      newCircuit: "dhw_supply",
      length_m: 30,
    });
    const ids = result.channelPatch.pipeIds;
    // First: p1 (heating_supply), p2 (heating_return), <new dhw_supply>, p3 (cold_water)
    expect(ids[0]).toBe("p1");
    expect(ids[1]).toBe("p2");
    expect(ids[2]).toBe(result.newPipe.id);
    expect(ids[3]).toBe("p3");
  });

  it("respects default DN + material when not supplied", () => {
    const channel = makeChannel();
    const existingPipes = [makePipe()];
    const result = addPipeToChannel({
      channel,
      existingPipes,
      newCircuit: "dhw_supply",
      length_m: 20,
    });
    expect(result.newPipe.dn).toBe(100);
    expect(result.newPipe.materialKey).toBe("steel_aged");
  });
});

/* ─── removePipeFromChannel ────────────────────────────────────── */

describe("removePipeFromChannel — Phase 12.5", () => {
  it("filters the removed pipe ID out of pipeIds", () => {
    const channel: SchemeChannel = {
      id: "ch_1",
      type: "channel",
      fromNodeId: "n1",
      toNodeId: "n2",
      channelType: "Л-7",
      crossSectionWidth_mm: 1200,
      crossSectionHeight_mm: 580,
      pipeIds: ["p1", "p2", "p3"],
    };
    const result = removePipeFromChannel({ channel, pipeIdToRemove: "p2" });
    expect(result.channelPatch.id).toBe("ch_1");
    expect(result.channelPatch.pipeIds).toEqual(["p1", "p3"]);
  });

  it("returns unchanged pipeIds when removing a non-existent ID", () => {
    const channel: SchemeChannel = {
      id: "ch_1",
      type: "channel",
      fromNodeId: "n1",
      toNodeId: "n2",
      channelType: "Л-4",
      crossSectionWidth_mm: 600,
      crossSectionHeight_mm: 450,
      pipeIds: ["p1", "p2"],
    };
    const result = removePipeFromChannel({ channel, pipeIdToRemove: "p_missing" });
    expect(result.channelPatch.pipeIds).toEqual(["p1", "p2"]);
  });

  it("preserves order of remaining pipes", () => {
    const channel: SchemeChannel = {
      id: "ch_1",
      type: "channel",
      fromNodeId: "n1",
      toNodeId: "n2",
      channelType: "Л-9",
      crossSectionWidth_mm: 1500,
      crossSectionHeight_mm: 610,
      pipeIds: ["p1", "p2", "p3", "p4", "p5"],
    };
    const result = removePipeFromChannel({ channel, pipeIdToRemove: "p3" });
    expect(result.channelPatch.pipeIds).toEqual(["p1", "p2", "p4", "p5"]);
  });
});

/* ─── channelPipeCountBadge ────────────────────────────────────── */

describe("channelPipeCountBadge — Phase 12.5", () => {
  it("returns '2п' for a 2-pipe channel", () => {
    const channel: SchemeChannel = {
      id: "ch_1",
      fromNodeId: "n1",
      toNodeId: "n2",
      pipeIds: ["p1", "p2"],
    };
    expect(channelPipeCountBadge(channel)).toBe("2п");
  });

  it("returns '5п' for a 5-pipe Л-9 channel", () => {
    const channel: SchemeChannel = {
      id: "ch_1",
      fromNodeId: "n1",
      toNodeId: "n2",
      pipeIds: ["p1", "p2", "p3", "p4", "p5"],
    };
    expect(channelPipeCountBadge(channel)).toBe("5п");
  });

  it("returns '1п' for a single-pipe channel (degenerate but valid)", () => {
    const channel: SchemeChannel = {
      id: "ch_1",
      fromNodeId: "n1",
      toNodeId: "n2",
      pipeIds: ["p1"],
    };
    expect(channelPipeCountBadge(channel)).toBe("1п");
  });
});

/* ─── containedPipes ───────────────────────────────────────────── */

describe("containedPipes — Phase 12.5", () => {
  it("returns the pipes in the channel's stored pipeIds order", () => {
    const pipes: SchemePipe[] = [
      { id: "p3", fromNodeId: "n1", toNodeId: "n2", materialKey: "steel_aged", dn: 100, length_m: 10, circuit: "dhw_supply" },
      { id: "p1", fromNodeId: "n1", toNodeId: "n2", materialKey: "steel_aged", dn: 100, length_m: 10, circuit: "heating_supply" },
      { id: "p2", fromNodeId: "n1", toNodeId: "n2", materialKey: "steel_aged", dn: 100, length_m: 10, circuit: "heating_return" },
    ];
    const channel: SchemeChannel = {
      id: "ch_1",
      fromNodeId: "n1",
      toNodeId: "n2",
      pipeIds: ["p1", "p2", "p3"],
    };
    const result = containedPipes(channel, pipes);
    expect(result.map((p) => p.id)).toEqual(["p1", "p2", "p3"]);
    expect(result.map((p) => p.circuit)).toEqual(["heating_supply", "heating_return", "dhw_supply"]);
  });

  it("silently skips missing pipe IDs (project corruption tolerance)", () => {
    const pipes: SchemePipe[] = [
      { id: "p1", fromNodeId: "n1", toNodeId: "n2", materialKey: "steel_aged", dn: 100, length_m: 10, circuit: "heating_supply" },
    ];
    const channel: SchemeChannel = {
      id: "ch_1",
      fromNodeId: "n1",
      toNodeId: "n2",
      pipeIds: ["p1", "p_missing", "p_also_missing"],
    };
    const result = containedPipes(channel, pipes);
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe("p1");
  });

  it("returns empty array for a channel with no pipeIds", () => {
    const channel: SchemeChannel = {
      id: "ch_1",
      fromNodeId: "n1",
      toNodeId: "n2",
      pipeIds: [],
    };
    expect(containedPipes(channel, [])).toEqual([]);
  });
});

/* ─── channelTypes registry sanity ─────────────────────────────── */

describe("CHANNEL_TYPE_REGISTRY — ГК-23/02 reference fidelity", () => {
  it("Л-4 spec matches GK_DATA.json (600×450, 2 pipes)", () => {
    const spec = CHANNEL_TYPE_REGISTRY["Л-4"];
    expect(spec.widthMm).toBe(600);
    expect(spec.heightMm).toBe(450);
    expect(spec.defaultPipeCount).toBe(2);
    expect(spec.series).toBe("СЕРИЯ Г-991-1");
  });

  it("Л-7 spec matches GK_DATA.json (1200×580, 4 pipes)", () => {
    const spec = CHANNEL_TYPE_REGISTRY["Л-7"];
    expect(spec.widthMm).toBe(1200);
    expect(spec.heightMm).toBe(580);
    expect(spec.defaultPipeCount).toBe(4);
  });

  it("Л-9 spec matches GK_DATA.json (1500×610, 5 pipes)", () => {
    const spec = CHANNEL_TYPE_REGISTRY["Л-9"];
    expect(spec.widthMm).toBe(1500);
    expect(spec.heightMm).toBe(610);
    expect(spec.defaultPipeCount).toBe(5);
  });

  it("CIRCUIT_DEFAULTS has all 5 circuits in canonical order", () => {
    expect(CIRCUIT_DEFAULTS).toHaveLength(5);
    expect(CIRCUIT_DEFAULTS.map((c) => c.code)).toEqual([
      "D2.1", "D2.2", "D3", "D4", "У1",
    ]);
  });

  it("CIRCUIT_DEFAULTS labels are Mongolian per ГК-23/02 convention", () => {
    expect(CIRCUIT_DEFAULTS[0]!.label).toBe("Дулаан нийлүүлэх");
    expect(CIRCUIT_DEFAULTS[1]!.label).toBe("Дулаан буцах");
    expect(CIRCUIT_DEFAULTS[2]!.label).toContain("Халуун ус");
    expect(CIRCUIT_DEFAULTS[3]!.label).toContain("Халуун ус");
  });

  it("CIRCUIT_DEFAULTS temperatures match 95/70 schedule + DHW 60°C", () => {
    expect(CIRCUIT_DEFAULTS[0]!.tempC).toBe(95);   // heating supply
    expect(CIRCUIT_DEFAULTS[1]!.tempC).toBe(70);   // heating return
    expect(CIRCUIT_DEFAULTS[2]!.tempC).toBe(60);   // DHW supply
    expect(CIRCUIT_DEFAULTS[3]!.tempC).toBe(60);   // DHW recirc
    expect(CIRCUIT_DEFAULTS[4]!.tempC).toBeNull(); // control / cold
  });

  it("circuitDefault() looks up by PipeCircuit", () => {
    expect(circuitDefault("heating_supply")?.code).toBe("D2.1");
    expect(circuitDefault("cold_water")?.code).toBe("У1");
    expect(circuitDefault(undefined)).toBeNull();
    expect(circuitDefault("nonexistent" as PipeCircuit)).toBeNull();
  });

  it("channelTypeLabel() formats standard channels with dimensions", () => {
    expect(channelTypeLabel("Л-4")).toBe("Л-4 (600×450)");
    expect(channelTypeLabel("Л-7")).toBe("Л-7 (1200×580)");
    expect(channelTypeLabel("Л-9")).toBe("Л-9 (1500×610)");
  });

  it("channelTypeLabel() handles custom + undefined", () => {
    expect(channelTypeLabel("custom", 800, 500)).toBe("Сонголтоор (800×500)");
    expect(channelTypeLabel("custom")).toBe("Сонголтоор");
    expect(channelTypeLabel(undefined)).toBe("Сонголтоор");
  });

  it("channelDimensions() resolves standard + custom", () => {
    expect(channelDimensions("Л-9")).toEqual({ widthMm: 1500, heightMm: 610 });
    expect(channelDimensions("custom", 900, 600)).toEqual({ widthMm: 900, heightMm: 600 });
    expect(channelDimensions(undefined)).toEqual({ widthMm: 0, heightMm: 0 });
  });
});

/* ─── End-to-end: ГК-23/02 АОС-1 wiring ───────────────────────── */

describe("End-to-end ГК-23/02 fidelity — Phase 12.5", () => {
  it("draws a Л-9 magistral with all 5 circuits matching the reference", () => {
    // ГК-23/02 main trunk: УДДТ → АОС-1 distribution, 5-pipe magistral
    const result = buildChannelFromDraw({
      fromNodeId: "uddt_1",
      toNodeId: "aos_1",
      channelType: "Л-9",
      pipeCircuits: ["heating_supply", "heating_return", "dhw_supply", "dhw_recirc", "cold_water"],
      defaultDn: 150,
      length_m: 85,
    });

    expect(result.channel.channelType).toBe("Л-9");
    expect(result.channel.crossSectionWidth_mm).toBe(1500);
    expect(result.channel.crossSectionHeight_mm).toBe(610);
    expect(result.pipes).toHaveLength(5);

    // All pipes share the channel geometry + length
    expect(new Set(result.pipes.map((p) => p.length_m))).toEqual(new Set([85]));
    expect(new Set(result.pipes.map((p) => p.fromNodeId))).toEqual(new Set(["uddt_1"]));
    expect(new Set(result.pipes.map((p) => p.toNodeId))).toEqual(new Set(["aos_1"]));

    // Cross-section detail view will lay them out left-to-right in canonical order
    const codes = result.pipes
      .map((p) => circuitDefault(p.circuit)?.code)
      .filter((c) => c != null);
    expect(codes).toEqual(["D2.1", "D2.2", "D3", "D4", "У1"]);

    expect(channelPipeCountBadge(result.channel)).toBe("5п");
  });

  it("retrofit workflow: promote existing pipe → Л-7 with DHW added", () => {
    // Existing heating-supply pipe gets promoted when engineer adds DHW
    const existingPipe: SchemePipe = {
      id: "p_legacy",
      fromNodeId: "n1",
      toNodeId: "n2",
      materialKey: "steel_aged",
      dn: 100,
      length_m: 32,
      circuit: "heating_supply",
      bendPoints: [{ x: 50, y: 30 }],
    };
    const result = convertPipeToChannel({
      existingPipe,
      channelType: "Л-7",
      additionalCircuits: ["heating_return", "dhw_supply", "dhw_recirc"],
    });
    expect(result.channel.channelType).toBe("Л-7");
    expect(result.channel.bendPoints).toEqual([{ x: 50, y: 30 }]);
    expect(result.additionalPipes).toHaveLength(3);
    expect(result.pipePatch.channelId).toBe(result.channel.id);
    expect(result.channel.pipeIds).toHaveLength(4); // 1 existing + 3 additional
  });
});
