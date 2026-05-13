/**
 * Phase 6.8.3 — symbol-size preset + per-entity override integration.
 *
 * Pure-math is locked down separately by
 * `scheme/__tests__/symbolSize.test.ts`. This file covers the
 * STORE-LEVEL contract:
 *
 *   1. `ProjectSettings.symbolSizePreset` round-trips through the
 *      store (settings updates persist + JSON survives).
 *   2. `SchemeNode.size_scale` round-trips identically.
 *   3. Backward compat: legacy projects without either field load
 *      cleanly and behave like "medium" + per-entity 1.0.
 *   4. Changing the preset DOES NOT mutate existing nodes — they
 *      keep their stored geometry; the preset only changes how
 *      they RENDER (visible at the SchemeEditor level, not the
 *      store).
 *   5. Setting `size_scale: 1.0` from the inspector triggers the
 *      "strip back to undefined" pattern so JSON round-trips don't
 *      accumulate inert overrides.
 *
 * Cross-reference: the composite multiplier
 * `SYMBOL_SIZE_PRESETS[preset] × (node.size_scale ?? 1.0)` is the
 * value that flows into `computeSymbolRadiusPx`; the math tests
 * already verify the multiplier semantics. Here we only verify the
 * DATA round-trips correctly.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { useHydraulicStore } from "../hydraulicStore";
import {
  SYMBOL_SIZE_PRESETS,
  DEFAULT_SYMBOL_SIZE_PRESET,
} from "../scheme/symbolSize";
import type { SchemeNode, HydraulicState } from "../hydraulicTypes";

beforeEach(() => {
  useHydraulicStore.getState().reset();
});

function ctp(id: string, size_scale?: number): SchemeNode {
  return {
    id,
    kind: "source_chp",
    label: id,
    x: 0,
    y: 0,
    ...(size_scale !== undefined ? { size_scale } : {}),
  };
}

/* ─── 1. Settings round-trip ───────────────────────────────────────── */

describe("ProjectSettings.symbolSizePreset — store contract", () => {
  it("default state has no preset set (legacy/medium behaviour)", () => {
    const s = useHydraulicStore.getState();
    expect(s.settings.symbolSizePreset).toBeUndefined();
  });

  it("updateSettings persists the preset choice", () => {
    useHydraulicStore.getState().updateSettings({ symbolSizePreset: "small" });
    expect(useHydraulicStore.getState().settings.symbolSizePreset).toBe("small");
    useHydraulicStore.getState().updateSettings({ symbolSizePreset: "large" });
    expect(useHydraulicStore.getState().settings.symbolSizePreset).toBe("large");
  });

  it("preset selection round-trips through JSON serialise / parse", () => {
    useHydraulicStore.getState().updateSettings({ symbolSizePreset: "small" });
    const json = JSON.stringify({
      nodes: [],
      pipes: [],
      settings: useHydraulicStore.getState().settings,
      schemaVersion: 5,
    });
    const reloaded = JSON.parse(json) as HydraulicState;
    expect(reloaded.settings.symbolSizePreset).toBe("small");
  });

  it("changing the preset DOES NOT touch existing nodes (render-only setting)", () => {
    const s = useHydraulicStore.getState();
    s.addNode(ctp("c1", 1.4));
    const before = useHydraulicStore.getState().nodes[0];
    s.updateSettings({ symbolSizePreset: "small" });
    const after = useHydraulicStore.getState().nodes[0];
    expect(after).toEqual(before);
    expect(after?.size_scale).toBe(1.4);
  });
});

/* ─── 2. Per-entity size_scale round-trip ──────────────────────────── */

describe("SchemeNode.size_scale — store contract", () => {
  it("addNode persists size_scale when provided", () => {
    useHydraulicStore.getState().addNode(ctp("c1", 1.5));
    const stored = useHydraulicStore.getState().nodes[0];
    expect(stored?.size_scale).toBe(1.5);
  });

  it("addNode without size_scale leaves the field undefined (legacy default)", () => {
    useHydraulicStore.getState().addNode(ctp("c-legacy"));
    const stored = useHydraulicStore.getState().nodes[0];
    expect(stored?.size_scale).toBeUndefined();
  });

  it("updateNode patches size_scale without touching other fields", () => {
    const s = useHydraulicStore.getState();
    s.addNode(ctp("c1"));
    s.updateNode("c1", { size_scale: 0.7 });
    const stored = useHydraulicStore.getState().nodes[0];
    expect(stored?.size_scale).toBe(0.7);
    expect(stored?.x).toBe(0);
    expect(stored?.kind).toBe("source_chp");
  });

  it("updateNode with size_scale: undefined clears the override", () => {
    const s = useHydraulicStore.getState();
    s.addNode(ctp("c1", 1.5));
    s.updateNode("c1", { size_scale: undefined });
    const stored = useHydraulicStore.getState().nodes[0];
    expect(stored?.size_scale).toBeUndefined();
  });

  it("size_scale round-trips through JSON serialise / parse", () => {
    useHydraulicStore.getState().addNode(ctp("c1", 0.85));
    const json = JSON.stringify({
      nodes: useHydraulicStore.getState().nodes,
      pipes: [],
      settings: useHydraulicStore.getState().settings,
      schemaVersion: 5,
    });
    const reloaded = JSON.parse(json) as HydraulicState;
    expect(reloaded.nodes[0]?.size_scale).toBeCloseTo(0.85, 6);
  });
});

/* ─── 3. Backward compatibility (Phase ≤ 6.8.2 projects) ───────────── */

describe("legacy projects (no preset, no size_scale)", () => {
  it("loading a project without symbolSizePreset uses the medium baseline", () => {
    const legacy = JSON.stringify({
      nodes: [{ id: "c1", kind: "source_chp", label: "ЦТП", x: 0, y: 0 }],
      pipes: [],
      settings: {
        networkType: "two_pipe_closed",
        temperatureScheduleKey: "95_70",
        city: "Улаанбаатар",
        primaryMaterialCategory: "steel",
        localLossesFraction: 0.3,
        sourcePressure_mpa: 0.6,
      },
      schemaVersion: 5,
    });
    const parsed = JSON.parse(legacy) as HydraulicState;
    expect(parsed.settings.symbolSizePreset).toBeUndefined();
    // The render layer reads `settings.symbolSizePreset ?? DEFAULT_SYMBOL_SIZE_PRESET`,
    // so an unset value falls back to "medium" → multiplier 1.0 →
    // exact same radius an old project saw.
    const effectivePreset = parsed.settings.symbolSizePreset ?? DEFAULT_SYMBOL_SIZE_PRESET;
    expect(SYMBOL_SIZE_PRESETS[effectivePreset]).toBe(1.0);
  });

  it("loading a project where nodes have no size_scale falls back to 1.0", () => {
    const legacy = JSON.stringify({
      nodes: [
        { id: "c1", kind: "consumer_apartment", label: "АОС-1", x: 10, y: 20 },
      ],
      pipes: [],
      settings: {
        networkType: "two_pipe_closed",
        temperatureScheduleKey: "95_70",
        city: "Улаанбаатар",
        primaryMaterialCategory: "steel",
        localLossesFraction: 0.3,
        sourcePressure_mpa: 0.6,
      },
      schemaVersion: 5,
    });
    const parsed = JSON.parse(legacy) as HydraulicState;
    expect(parsed.nodes[0]?.size_scale).toBeUndefined();
    // Effective per-entity scale = (node.size_scale ?? 1.0); the
    // render layer's nullish coalesce delivers 1.0 → no behaviour
    // change from Phase 6.5/6.7 saved projects.
    const effective = parsed.nodes[0]?.size_scale ?? 1.0;
    expect(effective).toBe(1.0);
  });
});

/* ─── 4. Composite preset × override semantics ─────────────────────── */

describe("composite preset × size_scale (data flow only)", () => {
  it("composite = preset × node.size_scale (multiplicative)", () => {
    // Engineer sets Small preset + flags one ЦТП with 1.5 override.
    // Composite at the render call site = 0.7 × 1.5 = 1.05.
    useHydraulicStore.getState().updateSettings({ symbolSizePreset: "small" });
    useHydraulicStore.getState().addNode(ctp("c1", 1.5));
    const s = useHydraulicStore.getState();
    const presetMul = SYMBOL_SIZE_PRESETS[s.settings.symbolSizePreset ?? DEFAULT_SYMBOL_SIZE_PRESET];
    const nodeMul = s.nodes[0]?.size_scale ?? 1.0;
    expect(presetMul * nodeMul).toBeCloseTo(1.05, 6);
  });

  it("medium preset + undefined size_scale = composite 1.0 (Phase 6A baseline)", () => {
    useHydraulicStore.getState().addNode(ctp("c1"));
    const s = useHydraulicStore.getState();
    const presetMul = SYMBOL_SIZE_PRESETS[s.settings.symbolSizePreset ?? DEFAULT_SYMBOL_SIZE_PRESET];
    const nodeMul = s.nodes[0]?.size_scale ?? 1.0;
    expect(presetMul * nodeMul).toBe(1.0);
  });
});
