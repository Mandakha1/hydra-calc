/**
 * Phase 6E — layer system tests.
 *
 * What we lock down:
 *   1. PipeCircuit → LayerKey mapping is stable (D2.1 = supply etc.).
 *   2. resolveLayer merges per-project overrides on top of the
 *      defaults sparsely (engineer can override JUST visibility
 *      without losing the colour).
 *   3. DEFAULT_LAYERS has the BNbD-standard Mongolian labels +
 *      drafting palette colours.
 *   4. Round-trip through the store: visibility toggle + lock toggle
 *      both persist as updateSettings({ layers: ... }).
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  DEFAULT_LAYERS,
  LAYER_ORDER,
  layerKeyFor,
  resolveLayer,
} from "../layers";
import { useHydraulicStore } from "../../hydraulicStore";

beforeEach(() => {
  useHydraulicStore.getState().reset();
});

describe("layerKeyFor — circuit → layer mapping", () => {
  it("maps each PipeCircuit role to its standard layer key", () => {
    expect(layerKeyFor("heating_supply")).toBe("D2.1");
    expect(layerKeyFor("heating_return")).toBe("D2.2");
    expect(layerKeyFor("dhw_supply")).toBe("D3");
    expect(layerKeyFor("dhw_recirc")).toBe("D4");
    expect(layerKeyFor("cold_water")).toBe("U1");
  });

  it("falls back to D2.1 for an undefined circuit (legacy pipes)", () => {
    expect(layerKeyFor(undefined)).toBe("D2.1");
  });
});

describe("DEFAULT_LAYERS — engineering drafting palette", () => {
  it("has all 5 layers with sensible defaults", () => {
    for (const key of LAYER_ORDER) {
      const cfg = DEFAULT_LAYERS[key];
      expect(cfg).toBeDefined();
      expect(cfg.visible).toBe(true);
      expect(cfg.locked).toBe(false);
      expect(cfg.color).toMatch(/^#[0-9a-fA-F]{6}$/); // hex colour
      expect(cfg.label.length).toBeGreaterThan(0);
    }
  });

  it("supply is red, return is blue (Russian/Mongolian standard)", () => {
    expect(DEFAULT_LAYERS["D2.1"].color.toLowerCase()).toBe("#a32d2d");
    expect(DEFAULT_LAYERS["D2.2"].color.toLowerCase()).toBe("#185fa5");
  });

  it("LAYER_ORDER lists all 5 keys in stable visual order", () => {
    expect(LAYER_ORDER).toEqual(["D2.1", "D2.2", "D3", "D4", "U1"]);
  });
});

describe("resolveLayer — defaults + sparse overrides", () => {
  it("returns the default config when no overrides exist", () => {
    const r = resolveLayer("heating_supply", undefined);
    expect(r.visible).toBe(true);
    expect(r.locked).toBe(false);
    expect(r.color.toLowerCase()).toBe("#a32d2d");
  });

  it("merges a per-layer visibility override on top of defaults", () => {
    const r = resolveLayer("heating_supply", { "D2.1": { visible: false } });
    expect(r.visible).toBe(false); // overridden
    expect(r.color.toLowerCase()).toBe("#a32d2d"); // default preserved
    expect(r.locked).toBe(false); // default preserved
  });

  it("override of one layer doesn't affect another", () => {
    const r_d22 = resolveLayer("heating_return", {
      "D2.1": { visible: false },
    });
    // D2.2 should still have its defaults — the D2.1 override is
    // scoped strictly to D2.1.
    expect(r_d22.visible).toBe(true);
    expect(r_d22.color.toLowerCase()).toBe("#185fa5");
  });

  it("colour override flows through (UI color-picker integration path)", () => {
    const r = resolveLayer("dhw_supply", { D3: { color: "#FF0099" } });
    expect(r.color).toBe("#FF0099");
    expect(r.visible).toBe(true); // not overridden
  });
});

describe("Store round-trip — Phase 6E settings persistence", () => {
  it("settings.layers is undefined on a fresh project", () => {
    expect(useHydraulicStore.getState().settings.layers).toBeUndefined();
  });

  it("updateSettings persists per-layer visibility override", () => {
    useHydraulicStore.getState().updateSettings({
      layers: { "D2.1": { visible: false } },
    });
    expect(
      useHydraulicStore.getState().settings.layers?.["D2.1"]?.visible,
    ).toBe(false);
  });

  it("updateSettings persists lock toggle", () => {
    useHydraulicStore.getState().updateSettings({
      layers: { D3: { locked: true } },
    });
    expect(
      useHydraulicStore.getState().settings.layers?.D3?.locked,
    ).toBe(true);
  });

  it("partial updates merge correctly (lock + colour set independently)", () => {
    // First toggle lock.
    useHydraulicStore.getState().updateSettings({
      layers: { U1: { locked: true } },
    });
    // Then set colour without losing lock — the LayerPanel does this
    // by spreading the existing override before merging.
    const existing = useHydraulicStore.getState().settings.layers ?? {};
    useHydraulicStore.getState().updateSettings({
      layers: {
        ...existing,
        U1: { ...existing.U1, color: "#123456" },
      },
    });
    const u1 = useHydraulicStore.getState().settings.layers?.U1;
    expect(u1?.locked).toBe(true);
    expect(u1?.color).toBe("#123456");
  });
});
