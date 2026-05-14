/**
 * Phase 7.3 — CAD-layer → pipe-circuit mapper tests.
 *
 * Covers all three signal tiers + the conflict detector. Synthetic
 * LayerHint fixtures; no DXF parser involved. The dxfImport
 * integration (extracting `entity.color` + `entity.lineType` from
 * dxf-parser output and passing them to the mapper) is exercised
 * via the Bayangol fixture suite in Phase 7.5.
 */
import { describe, it, expect } from "vitest";
import {
  mapCadLayerToCircuit,
  detectCircuitConflict,
  circuitLabelShort,
  type LayerHint,
} from "../dxfLayerMapper";

const hint = (over: Partial<LayerHint> & { name: string }): LayerHint => ({
  ...over,
});

/* ─── Tier 1: layer-name regex ─────────────────────────────────── */

describe("mapCadLayerToCircuit — Tier 1 (layer name)", () => {
  it("English 'Supply pipes' layer → heating_supply", () => {
    expect(mapCadLayerToCircuit(hint({ name: "Supply pipes" }))).toBe("heating_supply");
  });

  it("Russian 'Подающий' layer → heating_supply (Cyrillic)", () => {
    expect(mapCadLayerToCircuit(hint({ name: "Подача-Т1" }))).toBe("heating_supply");
  });

  it("Mongolian 'Нийлүүлэх' layer → heating_supply (Mongolian)", () => {
    expect(mapCadLayerToCircuit(hint({ name: "Нийлүүлэх_DN100" }))).toBe("heating_supply");
  });

  it("English 'Return pipes' layer → heating_return", () => {
    expect(mapCadLayerToCircuit(hint({ name: "Return pipes" }))).toBe("heating_return");
  });

  it("Mongolian 'Эргэх' layer → heating_return", () => {
    expect(mapCadLayerToCircuit(hint({ name: "Эргэх-Т2" }))).toBe("heating_return");
  });

  it("Mongolian 'Буцах' layer → heating_return", () => {
    expect(mapCadLayerToCircuit(hint({ name: "ШУГАМ-Буцах" }))).toBe("heating_return");
  });

  it("Russian 'Обр' layer → heating_return (Soviet-era convention)", () => {
    expect(mapCadLayerToCircuit(hint({ name: "Обр-магистраль" }))).toBe("heating_return");
  });

  it("'Халуун ус' → dhw_supply (must beat heating_supply regex)", () => {
    expect(mapCadLayerToCircuit(hint({ name: "Халуун ус нийлүүлэх" }))).toBe("dhw_supply");
  });

  it("'DHW Supply' layer → dhw_supply", () => {
    expect(mapCadLayerToCircuit(hint({ name: "DHW Supply Latin Pattern" }))).toBe("dhw_supply");
  });

  it("'Хүйтэн ус' → cold_water", () => {
    expect(mapCadLayerToCircuit(hint({ name: "Хүйтэн ус хангамж" }))).toBe("cold_water");
  });
});

/* ─── Tier 2: color index ──────────────────────────────────────── */

describe("mapCadLayerToCircuit — Tier 2 (AutoCAD color)", () => {
  it("Color 1 (red) + neutral layer → heating_supply", () => {
    expect(mapCadLayerToCircuit(hint({ name: "Layer0", colorIndex: 1 }))).toBe("heating_supply");
  });

  it("Color 5 (blue) + neutral layer → heating_return", () => {
    expect(mapCadLayerToCircuit(hint({ name: "Layer0", colorIndex: 5 }))).toBe("heating_return");
  });

  it("Color 6 (magenta) + neutral layer → dhw_supply", () => {
    expect(mapCadLayerToCircuit(hint({ name: "Layer0", colorIndex: 6 }))).toBe("dhw_supply");
  });

  it("Color 4 (cyan) + neutral layer → cold_water", () => {
    expect(mapCadLayerToCircuit(hint({ name: "Layer0", colorIndex: 4 }))).toBe("cold_water");
  });

  it("Color 3 (green) + neutral layer → dhw_recirc", () => {
    expect(mapCadLayerToCircuit(hint({ name: "Layer0", colorIndex: 3 }))).toBe("dhw_recirc");
  });

  it("Unmapped color 200 + neutral layer → falls through to unknown", () => {
    expect(mapCadLayerToCircuit(hint({ name: "Layer0", colorIndex: 200 }))).toBe("unknown");
  });
});

/* ─── Tier 3: line style ───────────────────────────────────────── */

describe("mapCadLayerToCircuit — Tier 3 (line style)", () => {
  it("CONTINUOUS + neutral layer → heating_supply", () => {
    expect(mapCadLayerToCircuit(hint({ name: "Layer0", lineStyle: "CONTINUOUS" }))).toBe("heating_supply");
  });

  it("DASHED + neutral layer → heating_return", () => {
    expect(mapCadLayerToCircuit(hint({ name: "Layer0", lineStyle: "DASHED" }))).toBe("heating_return");
  });

  it("HIDDEN linetype + neutral layer → heating_return", () => {
    expect(mapCadLayerToCircuit(hint({ name: "Layer0", lineStyle: "HIDDEN" }))).toBe("heating_return");
  });

  it("BYLAYER linetype + neutral layer → heating_supply", () => {
    expect(mapCadLayerToCircuit(hint({ name: "Layer0", lineStyle: "BYLAYER" }))).toBe("heating_supply");
  });

  it("DOT-DASH linetype + neutral layer → unknown (we don't claim)", () => {
    expect(mapCadLayerToCircuit(hint({ name: "Layer0", lineStyle: "CENTER" }))).toBe("unknown");
  });
});

/* ─── Tier priority ────────────────────────────────────────────── */

describe("mapCadLayerToCircuit — Tier priority", () => {
  it("Tier 1 wins over Tier 2 (layer name beats color)", () => {
    // Layer says supply, color says return — Tier 1 wins.
    expect(mapCadLayerToCircuit(hint({ name: "Supply", colorIndex: 5 }))).toBe("heating_supply");
  });

  it("Tier 2 wins over Tier 3 (color beats line style)", () => {
    // Neutral layer, color says return, line says supply — Tier 2 wins.
    expect(mapCadLayerToCircuit(hint({ name: "Layer0", colorIndex: 5, lineStyle: "CONTINUOUS" }))).toBe("heating_return");
  });

  it("Empty hint → unknown", () => {
    expect(mapCadLayerToCircuit(hint({ name: "Layer0" }))).toBe("unknown");
  });
});

/* ─── Conflict detection ──────────────────────────────────────── */

describe("detectCircuitConflict", () => {
  it("Layer 'Supply' + color 5 (return) → conflict", () => {
    expect(detectCircuitConflict(hint({ name: "Supply", colorIndex: 5 }))).toBe(true);
  });

  it("Layer 'Supply' + color 1 (supply) → no conflict (agreement)", () => {
    expect(detectCircuitConflict(hint({ name: "Supply", colorIndex: 1 }))).toBe(false);
  });

  it("Color 1 + DASHED → conflict (red supply vs dashed return)", () => {
    expect(detectCircuitConflict(hint({ name: "Layer0", colorIndex: 1, lineStyle: "DASHED" }))).toBe(true);
  });

  it("Single signal (only name) → no conflict", () => {
    expect(detectCircuitConflict(hint({ name: "Supply" }))).toBe(false);
  });

  it("Single signal (only color) → no conflict", () => {
    expect(detectCircuitConflict(hint({ name: "Layer0", colorIndex: 1 }))).toBe(false);
  });

  it("No signals at all → no conflict", () => {
    expect(detectCircuitConflict(hint({ name: "Layer0" }))).toBe(false);
  });

  it("All three signals agree (all supply) → no conflict", () => {
    expect(detectCircuitConflict(hint({ name: "Supply", colorIndex: 1, lineStyle: "CONTINUOUS" }))).toBe(false);
  });
});

/* ─── Engineer-facing labels ───────────────────────────────────── */

describe("circuitLabelShort", () => {
  it("returns Mongolian labels for every circuit", () => {
    expect(circuitLabelShort("heating_supply")).toBe("Халаалт нийлүүлэх (Т1)");
    expect(circuitLabelShort("heating_return")).toBe("Халаалт буцах (Т2)");
    expect(circuitLabelShort("dhw_supply")).toBe("Халуун ус (Т3)");
    expect(circuitLabelShort("dhw_recirc")).toBe("ХУ буцах (Т4)");
    expect(circuitLabelShort("cold_water")).toBe("Хүйтэн ус");
    expect(circuitLabelShort("unknown")).toBe("Тодорхойгүй");
  });
});
