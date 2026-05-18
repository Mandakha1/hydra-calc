/**
 * Phase 13.13 — Volumetric heat-load helper tests.
 */
import { describe, it, expect } from "vitest";
import {
  DEFAULT_SPECIFIC_LOAD_W_PER_M3,
  resolveSpecificLoad,
  resolveBuildingHeightM,
  computeVolumetricHeatLoad,
  autoVolumetricHeatLoad,
} from "../volumetricHeatLoad";

describe("DEFAULT_SPECIFIC_LOAD_W_PER_M3 — БНбД 23-02-09 typicals", () => {
  it("residential 45 W/m³ for АОС default", () => {
    expect(DEFAULT_SPECIFIC_LOAD_W_PER_M3.consumer_apartment).toBe(45);
  });

  it("hospital higher than residential (24/7 ops)", () => {
    expect(DEFAULT_SPECIFIC_LOAD_W_PER_M3.consumer_hospital!).toBeGreaterThan(
      DEFAULT_SPECIFIC_LOAD_W_PER_M3.consumer_apartment!,
    );
  });

  it("industrial lower than residential (less staffing density)", () => {
    expect(DEFAULT_SPECIFIC_LOAD_W_PER_M3.consumer_industrial!).toBeLessThan(
      DEFAULT_SPECIFIC_LOAD_W_PER_M3.consumer_apartment!,
    );
  });

  it("warehouse lowest (storage, looser temp)", () => {
    expect(DEFAULT_SPECIFIC_LOAD_W_PER_M3.consumer_warehouse).toBe(25);
  });
});

describe("resolveSpecificLoad", () => {
  it("engineer-typed override wins", () => {
    expect(resolveSpecificLoad({ kind: "consumer_apartment", override: 60 })).toBe(60);
  });

  it("falls back to per-kind default when no override", () => {
    expect(resolveSpecificLoad({ kind: "consumer_hospital" })).toBe(60);
  });

  it("category fallback for unmapped fine-grained kinds", () => {
    expect(resolveSpecificLoad({ kind: "consumer_unknown_kind" })).toBe(45);
  });

  it("source category fallback = 35", () => {
    expect(resolveSpecificLoad({ kind: "source_unknown_subtype" })).toBe(35);
  });

  it("returns 45 (residential) when no kind given", () => {
    expect(resolveSpecificLoad({ kind: undefined })).toBe(45);
  });

  it("ignores zero / negative override (falls to default)", () => {
    expect(resolveSpecificLoad({ kind: "consumer_apartment", override: 0 })).toBe(45);
    expect(resolveSpecificLoad({ kind: "consumer_apartment", override: -10 })).toBe(45);
  });
});

describe("resolveBuildingHeightM", () => {
  it("explicit buildingHeight_m wins", () => {
    expect(resolveBuildingHeightM({ buildingHeight_m: 15 })).toBe(15);
  });

  it("floors × floorHeight_m when no explicit", () => {
    expect(resolveBuildingHeightM({ floors: 5, floorHeight_m: 3.2 })).toBe(16);
  });

  it("floors × 3 m default when floorHeight_m missing", () => {
    expect(resolveBuildingHeightM({ floors: 4 })).toBe(12);
  });

  it("9 m fallback when no fields set", () => {
    expect(resolveBuildingHeightM({})).toBe(9);
  });
});

describe("computeVolumetricHeatLoad", () => {
  it("20 × 30 × 15 m × 45 W/m³ → 9000 m³, 405 000 W", () => {
    const r = computeVolumetricHeatLoad({
      width_m: 20,
      length_m: 30,
      height_m: 15,
      specificLoad_w_per_m3: 45,
    });
    expect(r.volume_m3).toBe(9000);
    expect(r.heatLoad_w).toBe(405000);
  });

  it("rounds volume to 0.1 m³, load to 1 W", () => {
    const r = computeVolumetricHeatLoad({
      width_m: 4.5,
      length_m: 7.3,
      height_m: 3.1,
      specificLoad_w_per_m3: 50,
    });
    // 4.5 × 7.3 × 3.1 = 101.835 → 101.8
    expect(r.volume_m3).toBeCloseTo(101.8, 1);
    // 4.5 × 7.3 × 3.1 × 50 = 5091.75 → 5092
    expect(r.heatLoad_w).toBe(5092);
  });

  it("returns 0 when any dimension is non-positive", () => {
    expect(computeVolumetricHeatLoad({ width_m: 0, length_m: 10, height_m: 5, specificLoad_w_per_m3: 45 })).toEqual({ volume_m3: 0, heatLoad_w: 0 });
    expect(computeVolumetricHeatLoad({ width_m: 10, length_m: -1, height_m: 5, specificLoad_w_per_m3: 45 })).toEqual({ volume_m3: 0, heatLoad_w: 0 });
    expect(computeVolumetricHeatLoad({ width_m: 10, length_m: 5, height_m: 0, specificLoad_w_per_m3: 45 })).toEqual({ volume_m3: 0, heatLoad_w: 0 });
    expect(computeVolumetricHeatLoad({ width_m: 10, length_m: 5, height_m: 3, specificLoad_w_per_m3: 0 })).toEqual({ volume_m3: 0, heatLoad_w: 0 });
  });
});

describe("autoVolumetricHeatLoad — top-level Inspector helper", () => {
  it("typical 5-storey apartment: 20×30 m × 5 floors × 3 m × 45 W/m³ → 9000 m³, 405 kW", () => {
    const r = autoVolumetricHeatLoad({
      kind: "consumer_apartment",
      width_m: 20,
      height_m: 30,
      floors: 5,
      // floorHeight_m omitted → 3.0 default
    });
    expect(r).not.toBeNull();
    expect(r!.volume_m3).toBe(9000);
    expect(r!.heatLoad_w).toBe(405000);
    expect(r!.specificLoad_w_per_m3).toBe(45);
  });

  it("hospital uses higher specificLoad → larger load for same volume", () => {
    const apt = autoVolumetricHeatLoad({
      kind: "consumer_apartment",
      width_m: 20,
      height_m: 30,
      buildingHeight_m: 15,
    });
    const hosp = autoVolumetricHeatLoad({
      kind: "consumer_hospital",
      width_m: 20,
      height_m: 30,
      buildingHeight_m: 15,
    });
    expect(hosp!.heatLoad_w).toBeGreaterThan(apt!.heatLoad_w);
    // hospital 60 W/m³ vs apartment 45 W/m³ → 60/45 = 1.333× more
    expect(hosp!.heatLoad_w / apt!.heatLoad_w).toBeCloseTo(60 / 45, 2);
  });

  it("engineer-set specificLoad_w_per_m3 override wins over kind-default", () => {
    const r = autoVolumetricHeatLoad({
      kind: "consumer_apartment",
      width_m: 10,
      height_m: 10,
      buildingHeight_m: 5,
      specificLoad_w_per_m3: 80, // engineer audit override
    });
    expect(r!.specificLoad_w_per_m3).toBe(80);
    expect(r!.heatLoad_w).toBe(10 * 10 * 5 * 80);
  });

  it("returns null when geometry is incomplete", () => {
    expect(autoVolumetricHeatLoad({ kind: "consumer_apartment" })).toBeNull();
    expect(autoVolumetricHeatLoad({ kind: "consumer_apartment", width_m: 20 })).toBeNull();
    expect(autoVolumetricHeatLoad({ kind: "consumer_apartment", width_m: 20, height_m: 30 })).not.toBeNull(); // has buildingHeight fallback
  });

  it("warehouse (low spec load) ≈ 56% of apartment for same dims", () => {
    const wh = autoVolumetricHeatLoad({
      kind: "consumer_warehouse",
      width_m: 50,
      height_m: 30,
      buildingHeight_m: 10,
    });
    const apt = autoVolumetricHeatLoad({
      kind: "consumer_apartment",
      width_m: 50,
      height_m: 30,
      buildingHeight_m: 10,
    });
    // warehouse 25 W/m³ vs apartment 45 W/m³ = 25/45 ≈ 0.556
    expect(wh!.heatLoad_w / apt!.heatLoad_w).toBeCloseTo(25 / 45, 2);
  });
});
