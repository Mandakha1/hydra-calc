/**
 * Phase 12.12 — Channel compliance rules tests.
 */
import { describe, it, expect } from "vitest";
import {
  channelClearanceMin,
  channelInsulationRequired,
  channelDimensionMatch,
  CHANNEL_RULES,
  CHANNEL_TOP_CLEARANCE_MIN_MM,
  CHANNEL_BURIAL_DEPTH_REQUIRES_INSULATION_M,
} from "../channelRules";
import { ALL_RULES } from "../rules";
import { runComplianceCheck, findChannel } from "../ruleEngine";
import { buildChannelFromDraw } from "../../../scheme/channelOperations";
import { emptyState, type HydraulicState, type SchemeChannel, type SchemePipe } from "../../../hydraulicTypes";

function makeState(channel: SchemeChannel, pipes: SchemePipe[]): HydraulicState {
  const s = emptyState();
  s.channels = [channel];
  s.pipes = pipes;
  return s;
}

describe("channelClearanceMin — Phase 12.12", () => {
  it("passes when Л-7 (580 mm) holds DN 100 pipes (clearance ~400 mm)", () => {
    const { channel, pipes } = buildChannelFromDraw({
      fromNodeId: "a", toNodeId: "b",
      channelType: "Л-7",
      pipeCircuits: ["heating_supply", "heating_return"],
      defaultDn: 100,
      length_m: 30,
    });
    const violations = channelClearanceMin.check(makeState(channel, pipes), undefined);
    expect(violations).toEqual([]);
  });

  it("fires for a Л-4 (450 mm) channel forced to hold DN 300 pipe (insufficient height)", () => {
    const { channel, pipes } = buildChannelFromDraw({
      fromNodeId: "a", toNodeId: "b",
      channelType: "Л-4", // 600×450 mm
      pipeCircuits: ["heating_supply"],
      defaultDn: 300,
      length_m: 20,
    });
    const violations = channelClearanceMin.check(makeState(channel, pipes), undefined);
    expect(violations).toHaveLength(1);
    expect(violations[0]!.severity).toBe("error");
    expect(violations[0]!.message).toMatch(/Л-4/);
    expect(violations[0]!.entityType).toBe("pipe");
  });

  it("accounts for insulation thickness in the largest-pipe OD", () => {
    // Л-4 450 mm channel, DN 200 pipe (=200 mm) + 80 sleeper = 280 mm fits → BUT with
    // 100 mm insulation each side adding 200 mm OD → 400 + 80 = 480 mm > 450 mm.
    const { channel, pipes } = buildChannelFromDraw({
      fromNodeId: "a", toNodeId: "b",
      channelType: "Л-4",
      pipeCircuits: ["heating_supply"],
      defaultDn: 200,
      length_m: 20,
    });
    pipes[0]!.insulationThickness_mm = 100;
    const violations = channelClearanceMin.check(makeState(channel, pipes), undefined);
    expect(violations).toHaveLength(1);
  });

  it("skips channels with no contained pipes (no engineer-meaningful violation)", () => {
    const empty: SchemeChannel = {
      id: "ch", fromNodeId: "a", toNodeId: "b",
      channelType: "Л-9",
      crossSectionWidth_mm: 1500, crossSectionHeight_mm: 610,
      pipeIds: [],
    };
    expect(channelClearanceMin.check(makeState(empty, []), undefined)).toEqual([]);
  });

  it("skips channels with no dimensions set (custom without W×H)", () => {
    const undef: SchemeChannel = {
      id: "ch", fromNodeId: "a", toNodeId: "b",
      channelType: "custom",
      pipeIds: ["p"],
    };
    const pipe: SchemePipe = {
      id: "p", fromNodeId: "a", toNodeId: "b",
      materialKey: "steel_aged", dn: 100, length_m: 10,
      channelId: "ch",
    };
    expect(channelClearanceMin.check(makeState(undef, [pipe]), undefined)).toEqual([]);
  });

  it("Phase-5 projects without channels emit no violations", () => {
    const state = emptyState();
    expect(channelClearanceMin.check(state, undefined)).toEqual([]);
  });
});

describe("channelInsulationRequired — Phase 12.12", () => {
  it("passes for a shallow channel (depth <= 0.5 m)", () => {
    const { channel, pipes } = buildChannelFromDraw({
      fromNodeId: "a", toNodeId: "b",
      channelType: "Л-4",
      pipeCircuits: ["heating_supply"],
      length_m: 20,
    });
    channel.burialDepth_m = 0.3;
    const violations = channelInsulationRequired.check(makeState(channel, pipes), undefined);
    expect(violations).toEqual([]);
  });

  it("fires when burial depth > 0.5 m and pipes lack insulation", () => {
    const { channel, pipes } = buildChannelFromDraw({
      fromNodeId: "a", toNodeId: "b",
      channelType: "Л-7",
      pipeCircuits: ["heating_supply", "heating_return"],
      length_m: 30,
    });
    channel.burialDepth_m = 1.5;
    // pipes have no insulationKey / thickness
    const violations = channelInsulationRequired.check(makeState(channel, pipes), undefined);
    expect(violations).toHaveLength(2); // one per uninsulated pipe
    expect(violations[0]!.severity).toBe("warn");
    expect(violations[0]!.message).toMatch(/дулаалга алга/);
  });

  it("passes when burial depth > 0.5 m AND pipes have insulation declared", () => {
    const { channel, pipes } = buildChannelFromDraw({
      fromNodeId: "a", toNodeId: "b",
      channelType: "Л-7",
      pipeCircuits: ["heating_supply"],
      length_m: 30,
    });
    channel.burialDepth_m = 1.5;
    pipes[0]!.insulationKey = "mineral_wool_50mm";
    pipes[0]!.insulationThickness_mm = 50;
    const violations = channelInsulationRequired.check(makeState(channel, pipes), undefined);
    expect(violations).toEqual([]);
  });

  it("only flags the uninsulated pipes (mixed channels)", () => {
    const { channel, pipes } = buildChannelFromDraw({
      fromNodeId: "a", toNodeId: "b",
      channelType: "Л-9",
      pipeCircuits: ["heating_supply", "heating_return", "dhw_supply"],
      length_m: 40,
    });
    channel.burialDepth_m = 1.2;
    // First two pipes get insulation, third does not.
    pipes[0]!.insulationKey = "mineral_wool_50mm";
    pipes[0]!.insulationThickness_mm = 50;
    pipes[1]!.insulationKey = "mineral_wool_50mm";
    pipes[1]!.insulationThickness_mm = 50;
    const violations = channelInsulationRequired.check(makeState(channel, pipes), undefined);
    expect(violations).toHaveLength(1);
    expect(violations[0]!.entityId).toBe(pipes[2]!.id);
  });

  it("constant matches the documented БНбД threshold (0.5 m)", () => {
    expect(CHANNEL_BURIAL_DEPTH_REQUIRES_INSULATION_M).toBe(0.5);
  });
});

describe("channelDimensionMatch — Phase 12.12", () => {
  it("passes when channel.channelType + crossSection* agree with registry", () => {
    const { channel, pipes } = buildChannelFromDraw({
      fromNodeId: "a", toNodeId: "b",
      channelType: "Л-9",
      pipeCircuits: ["heating_supply"],
      length_m: 30,
    });
    // buildChannelFromDraw pulls dims from the registry → match
    const violations = channelDimensionMatch.check(makeState(channel, pipes), undefined);
    expect(violations).toEqual([]);
  });

  it("fires when stored dims don't match registry (stale fields)", () => {
    const { channel, pipes } = buildChannelFromDraw({
      fromNodeId: "a", toNodeId: "b",
      channelType: "Л-9",
      pipeCircuits: ["heating_supply"],
      length_m: 30,
    });
    // Simulate engineer-edit divergence: type says Л-9 but dims stale at Л-7.
    channel.crossSectionWidth_mm = 1200;
    channel.crossSectionHeight_mm = 580;
    const violations = channelDimensionMatch.check(makeState(channel, pipes), undefined);
    expect(violations).toHaveLength(1);
    expect(violations[0]!.message).toMatch(/Л-9/);
    expect(violations[0]!.fixHint).toMatch(/Right-click/);
  });

  it("skips 'custom' channels (no registry baseline)", () => {
    const { channel, pipes } = buildChannelFromDraw({
      fromNodeId: "a", toNodeId: "b",
      channelType: "custom",
      customWidth_mm: 950,
      customHeight_mm: 520,
      pipeCircuits: ["heating_supply"],
      length_m: 20,
    });
    const violations = channelDimensionMatch.check(makeState(channel, pipes), undefined);
    expect(violations).toEqual([]);
  });
});

describe("CHANNEL_RULES registry integration", () => {
  it("CHANNEL_RULES bundles the 3 channel rules", () => {
    expect(CHANNEL_RULES).toHaveLength(3);
    expect(CHANNEL_RULES.map((r) => r.id)).toEqual([
      "channel_clearance_min",
      "channel_insulation_required",
      "channel_dimension_match",
    ]);
  });

  it("ALL_RULES includes the channel rules", () => {
    const ids = ALL_RULES.map((r) => r.id);
    expect(ids).toContain("channel_clearance_min");
    expect(ids).toContain("channel_insulation_required");
    expect(ids).toContain("channel_dimension_match");
  });

  it("runComplianceCheck primes the channel cache so findChannel resolves", () => {
    const { channel, pipes } = buildChannelFromDraw({
      fromNodeId: "a", toNodeId: "b",
      channelType: "Л-7",
      pipeCircuits: ["heating_supply"],
      length_m: 30,
    });
    const state = makeState(channel, pipes);
    // Pre-run: cache unprimed; helper falls back to project.channels scan
    expect(findChannel(state, channel.id)?.id).toBe(channel.id);
    // Run the engine — channelClearanceMin will iterate channels
    const report = runComplianceCheck(state, undefined, CHANNEL_RULES);
    expect(report.results).toBeDefined();
  });

  it("full compliance run on a Phase 12.11-shaped scene completes without crashing", () => {
    const { channel, pipes } = buildChannelFromDraw({
      fromNodeId: "a", toNodeId: "b",
      channelType: "Л-9",
      pipeCircuits: ["heating_supply", "heating_return", "dhw_supply"],
      length_m: 60,
    });
    const state = makeState(channel, pipes);
    const report = runComplianceCheck(state, undefined, ALL_RULES);
    // Just confirm we ran; specific violation counts depend on the
    // emptyState fixtures + the 30 prior rules.
    expect(report.rulesChecked.length).toBeGreaterThanOrEqual(33);
  });
});

describe("CHANNEL_TOP_CLEARANCE_MIN_MM constant", () => {
  it("matches the documented БНбД threshold", () => {
    expect(CHANNEL_TOP_CLEARANCE_MIN_MM).toBe(100);
  });
});
