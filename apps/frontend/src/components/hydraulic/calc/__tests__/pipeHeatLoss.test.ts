/**
 * Phase 5C — pipeHeatLoss unit tests.
 *
 * What we lock down:
 *   - The 5-layer cylindrical-conduction formula returns engineering-
 *     correct values across the four standard Mongolian use cases:
 *       1. Bare pipe in outdoor air (warning case for missed insulation)
 *       2. PUR-50 in outdoor air at peak -39 °C
 *       3. Same in buried trench at +5 °C soil
 *       4. Same in concrete channel at +10 °C dead-air
 *   - Sensitivity: doubling insulation thickness does NOT halve loss
 *     (cylindrical log scaling, not plane-wall) but reduces it sub-
 *     stantially — captures the physics correctly so any bug that
 *     accidentally inverts the resistance ratio is caught.
 *   - Path aggregation: a 100 m DN50 trunk at 20 W/m losing through
 *     0.5 kg/s flow drops ~1.0 °C — the engineering bar for Phase 5D
 *     temperature-drop integration.
 *   - Edge cases: ΔT=0 → q'=0; zero insulation → bare-pipe regime;
 *     monotonic-with-diameter (larger pipe = more loss at same
 *     insulation thickness).
 *   - Surface temperature: insulated pipe is touch-safe (1-5 °C above
 *     ambient); bare pipe is hot enough to burn (60 °C+).
 *
 * Reference: cross-checked against VDI Heat Atlas Section M and
 * Sokolov «Тепловые сети» Ch.5 within the ±15 % engineering band.
 */
import { describe, it, expect } from "vitest";
import {
  computePipeHeatLoss,
  computeTemperatureDropAlongPath,
  K_PUR_FOAM_FRESH_W_MK,
  K_PUR_FOAM_AGED_W_MK,
} from "../pipeHeatLoss";

// Standard GOST DN50: OD 57 mm, ID 50 mm (wall 3.5 mm).
const DN50 = { pipeOuterDiameter_mm: 57, pipeWallThickness_mm: 3.5 };
// Standard GOST DN65: OD 76 mm, ID 68 mm (wall 4.0 mm).
const DN65 = { pipeOuterDiameter_mm: 76, pipeWallThickness_mm: 4.0 };
// Standard GOST DN100: OD 108 mm, ID 100 mm.
const DN100 = { pipeOuterDiameter_mm: 108, pipeWallThickness_mm: 4.0 };
// Standard GOST DN200: OD 219 mm, ID 207 mm.
const DN200 = { pipeOuterDiameter_mm: 219, pipeWallThickness_mm: 6.0 };

describe("computePipeHeatLoss — Phase 5C", () => {
  // ─────────────────────────────────────────────────────────────
  // Case 1 — Bare pipe, outdoor air, peak design temp.
  // The warning regime: any DN50 trunk left bare at УБ -39 °C
  // loses 200+ W/m. A 100 m trunk → 20 kW lost — more than most
  // ИТП consumer loads. Catches "engineer forgot insulation" UX
  // checks downstream of this module.
  // ─────────────────────────────────────────────────────────────
  it("1. bare DN50 in -39 °C air at 95 °C → q' > 200 W/m (no-insulation warning regime)", () => {
    const r = computePipeHeatLoss({
      ...DN50,
      fluidTemp_C: 95,
      ambientTemp_C: -39,
      insulationThickness_mm: 0,
      installation: "air",
    });
    expect(r.heatLossPerMeter_W).toBeGreaterThan(200);
    // Sanity: total resistance dominated by outer film for bare pipe.
    expect(r.thermalResistance_mK_W.outer).toBeGreaterThan(
      r.thermalResistance_mK_W.pipeWall * 100,
    );
  });

  // ─────────────────────────────────────────────────────────────
  // Case 2 — PUR-50 DN50 in outdoor air, -39 °C.
  // Reference: VDI Heat Atlas Section M, DN50 + 50 mm PUR aged in
  // air at -40 °C: q' ≈ 20 ± 2 W/m. Mongolian fresh-PUR design
  // (k=0.025) matches this within 0.5 W/m.
  // ─────────────────────────────────────────────────────────────
  it("2. DN50 + 50 mm PUR in -39 °C air → q' between 18 and 22 W/m (published reference)", () => {
    const r = computePipeHeatLoss({
      ...DN50,
      fluidTemp_C: 95,
      ambientTemp_C: -39,
      insulationThickness_mm: 50,
      installation: "air",
    });
    expect(r.heatLossPerMeter_W).toBeGreaterThan(18);
    expect(r.heatLossPerMeter_W).toBeLessThan(22);
    // Sanity: insulation is the dominant resistance.
    expect(r.thermalResistance_mK_W.insulation).toBeGreaterThan(
      r.thermalResistance_mK_W.outer * 5,
    );
  });

  // ─────────────────────────────────────────────────────────────
  // Case 3 — DN65 in air. Larger pipe → larger surface → more loss
  // at the same insulation thickness (curvature effect).
  // ─────────────────────────────────────────────────────────────
  it("3. DN65 + 50 mm PUR in -39 °C air → q' between 22 and 26 W/m", () => {
    const r = computePipeHeatLoss({
      ...DN65,
      fluidTemp_C: 95,
      ambientTemp_C: -39,
      insulationThickness_mm: 50,
      installation: "air",
    });
    expect(r.heatLossPerMeter_W).toBeGreaterThan(22);
    expect(r.heatLossPerMeter_W).toBeLessThan(26);
  });

  // ─────────────────────────────────────────────────────────────
  // Case 4 — Buried at +5 °C soil. Realistic УБ winter case: soil
  // at 1.5 m depth stays around +1 …+5 °C even in February.
  // Reference value matches Sokolov Тепловые сети §5.3.
  // ─────────────────────────────────────────────────────────────
  it("4. DN50 + 50 mm PUR buried 1.5 m, soil +5 °C → q' between 10 and 14 W/m", () => {
    const r = computePipeHeatLoss({
      ...DN50,
      fluidTemp_C: 95,
      ambientTemp_C: 5,
      insulationThickness_mm: 50,
      installation: "buried",
      burialDepth_m: 1.5,
    });
    expect(r.heatLossPerMeter_W).toBeGreaterThan(10);
    expect(r.heatLossPerMeter_W).toBeLessThan(14);
  });

  // ─────────────────────────────────────────────────────────────
  // Case 5 — Channel at +10 °C. Concrete trench retains warmth from
  // the pipe itself, so dead-air is much warmer than outdoor.
  // ─────────────────────────────────────────────────────────────
  it("5. DN50 + 50 mm PUR in +10 °C channel air → q' between 12 and 16 W/m", () => {
    const r = computePipeHeatLoss({
      ...DN50,
      fluidTemp_C: 95,
      ambientTemp_C: 10,
      insulationThickness_mm: 50,
      installation: "channel",
    });
    expect(r.heatLossPerMeter_W).toBeGreaterThan(12);
    expect(r.heatLossPerMeter_W).toBeLessThan(16);
  });

  // ─────────────────────────────────────────────────────────────
  // Case 6 — Sensitivity: doubling thickness reduces loss but does
  // NOT halve it. Plane-wall intuition (q ∝ 1/t) is wrong for
  // thick cylindrical insulation because ln(d_ins/d_pipe) grows
  // sub-linearly. Catches a "swapped resistance" bug or an
  // implementation that uses the plane-wall formula by mistake.
  // ─────────────────────────────────────────────────────────────
  it("6. sensitivity: 50 mm insulation reduces loss vs 25 mm but does NOT halve it (cylindrical log scaling)", () => {
    const base = { ...DN50, fluidTemp_C: 95, ambientTemp_C: -39 };
    const thin = computePipeHeatLoss({
      ...base,
      insulationThickness_mm: 25,
      installation: "air",
    });
    const thick = computePipeHeatLoss({
      ...base,
      insulationThickness_mm: 50,
      installation: "air",
    });
    // Thicker insulation must reduce heat loss.
    expect(thick.heatLossPerMeter_W).toBeLessThan(thin.heatLossPerMeter_W);
    // But the ratio is sub-linear: q'(50) / q'(25) is around 0.6-0.75,
    // NOT 0.5. This is the physical signature of cylindrical conduction.
    const ratio = thick.heatLossPerMeter_W / thin.heatLossPerMeter_W;
    expect(ratio).toBeGreaterThan(0.55);
    expect(ratio).toBeLessThan(0.8);
  });

  // ─────────────────────────────────────────────────────────────
  // Case 7 — Path-level temperature drop. Phase 5D's headline
  // sanity: a 100 m DN50 trunk at 20 W/m losing through 0.5 kg/s
  // drops the supply by ~1 °C. Anything substantially different
  // means the temperature-drop integration is wrong.
  // ─────────────────────────────────────────────────────────────
  it("7. 100 m DN50 PUR at 20 W/m, ṁ = 0.5 kg/s → ΔT ≈ 1.0 °C", () => {
    const { temperatureDrop_C, totalHeatLoss_W } =
      computeTemperatureDropAlongPath([
        { heatLossPerMeter_W: 20, length_m: 100, massFlow_kg_s: 0.5 },
      ]);
    expect(totalHeatLoss_W).toBeCloseTo(2000, 0);
    expect(temperatureDrop_C).toBeGreaterThan(0.9);
    expect(temperatureDrop_C).toBeLessThan(1.1);
  });

  // ─────────────────────────────────────────────────────────────
  // Case 8 — Zero ΔT means zero loss. Sanity for the divide-by-
  // resistance formula. Also: the (negative-loss) reverse case
  // works for return-pipe scenarios where ambient > fluid.
  // ─────────────────────────────────────────────────────────────
  it("8. zero ΔT (ambient = fluid) → q' = 0 (and sign flips with ΔT)", () => {
    const r = computePipeHeatLoss({
      ...DN50,
      fluidTemp_C: 10,
      ambientTemp_C: 10,
      insulationThickness_mm: 50,
      installation: "air",
    });
    expect(r.heatLossPerMeter_W).toBe(0);
    // Reverse sign: cold pipe in warmer ambient → heat gain (negative
    // "loss"). The formula must remain valid (not return |q'|).
    const reversed = computePipeHeatLoss({
      ...DN50,
      fluidTemp_C: -10,
      ambientTemp_C: 20,
      insulationThickness_mm: 50,
      installation: "air",
    });
    expect(reversed.heatLossPerMeter_W).toBeLessThan(0);
  });

  // ─────────────────────────────────────────────────────────────
  // Case 9 — Zero insulation reduces to the bare-pipe regime.
  // Should match Case 1's order of magnitude.
  // ─────────────────────────────────────────────────────────────
  it("9. zero insulation thickness → bare-pipe regime (q' > 200 W/m on DN50 air)", () => {
    const r = computePipeHeatLoss({
      ...DN50,
      fluidTemp_C: 95,
      ambientTemp_C: -39,
      insulationThickness_mm: 0,
      installation: "air",
    });
    expect(r.heatLossPerMeter_W).toBeGreaterThan(200);
    // Insulation layer must be reported as 0 m·K/W.
    expect(r.thermalResistance_mK_W.insulation).toBe(0);
    expect(r.thermalResistance_mK_W.jacket).toBe(0);
  });

  // ─────────────────────────────────────────────────────────────
  // Case 10 — Surface temp for insulated pipe is just above
  // ambient. The "safe to touch" engineering invariant.
  // ─────────────────────────────────────────────────────────────
  it("10. surface temp for insulated PUR-50 DN50 in -39 °C air → 1-5 °C above ambient (touch-safe)", () => {
    const r = computePipeHeatLoss({
      ...DN50,
      fluidTemp_C: 95,
      ambientTemp_C: -39,
      insulationThickness_mm: 50,
      installation: "air",
    });
    const above = r.surfaceTemperature_C - -39;
    expect(above).toBeGreaterThan(1);
    expect(above).toBeLessThan(5);
  });

  // ─────────────────────────────────────────────────────────────
  // Case 11 — Bare pipe surface is dangerously hot. Roughly equal
  // to fluid temp because the inner convection film is negligible.
  // Engineers would key off this to flag burn-hazard in UI later.
  // ─────────────────────────────────────────────────────────────
  it("11. surface temp for bare DN50 at 95 °C in -39 °C air → > 60 °C (burn-hazard)", () => {
    const r = computePipeHeatLoss({
      ...DN50,
      fluidTemp_C: 95,
      ambientTemp_C: -39,
      insulationThickness_mm: 0,
      installation: "air",
    });
    expect(r.surfaceTemperature_C).toBeGreaterThan(60);
    expect(r.surfaceTemperature_C).toBeLessThan(95); // physically can't exceed fluid
  });

  // ─────────────────────────────────────────────────────────────
  // Case 12 — Monotonic q' with diameter at fixed insulation. The
  // curvature effect: larger pipe → less cylindrical concentration
  // → smaller log term in insulation R. So q' must rise.
  // ─────────────────────────────────────────────────────────────
  it("12. q' monotonic with pipe diameter at fixed insulation (curvature effect)", () => {
    const common = {
      fluidTemp_C: 95,
      ambientTemp_C: -39,
      insulationThickness_mm: 50,
      installation: "air" as const,
    };
    const q50 = computePipeHeatLoss({ ...DN50, ...common }).heatLossPerMeter_W;
    const q100 = computePipeHeatLoss({ ...DN100, ...common }).heatLossPerMeter_W;
    const q200 = computePipeHeatLoss({ ...DN200, ...common }).heatLossPerMeter_W;
    expect(q100).toBeGreaterThan(q50);
    expect(q200).toBeGreaterThan(q100);
  });

  // ─────────────────────────────────────────────────────────────
  // Bonus — verify the БНбД aged-PUR design value flows through
  // when callers pass it explicitly. Catches "default is hardwired"
  // bugs that would lock the entire codebase to one k_ins value.
  // ─────────────────────────────────────────────────────────────
  it("aged PUR (k = 0.033) gives ~32 % higher loss than fresh (k = 0.025)", () => {
    const common = {
      ...DN50,
      fluidTemp_C: 95,
      ambientTemp_C: -39,
      insulationThickness_mm: 50,
      installation: "air" as const,
    };
    const fresh = computePipeHeatLoss({
      ...common,
      insulationConductivity_W_mK: K_PUR_FOAM_FRESH_W_MK,
    });
    const aged = computePipeHeatLoss({
      ...common,
      insulationConductivity_W_mK: K_PUR_FOAM_AGED_W_MK,
    });
    expect(aged.heatLossPerMeter_W).toBeGreaterThan(fresh.heatLossPerMeter_W);
    const pctMore =
      (aged.heatLossPerMeter_W - fresh.heatLossPerMeter_W) /
      fresh.heatLossPerMeter_W;
    expect(pctMore).toBeGreaterThan(0.2); // at least 20 % worse aged
    expect(pctMore).toBeLessThan(0.4); // not more than 40 % — sanity
  });

  // Network-aggregate sanity. The headline 7.6 kW total claim from
  // the Phase 5C planning prompt: 380 m of DN50 PUR-50 at -39 °C air
  // should net out to ~7-9 kW lost. This validates the Phase 5D
  // integration argument.
  it("network aggregate: 380 m of DN50 PUR-50 at -39 °C air → 6.8-8.4 kW total loss", () => {
    const r = computePipeHeatLoss({
      ...DN50,
      fluidTemp_C: 95,
      ambientTemp_C: -39,
      insulationThickness_mm: 50,
      installation: "air",
    });
    // Pass each "pipe" with the same q' to mimic a uniform trunk.
    const { totalHeatLoss_W } = computeTemperatureDropAlongPath([
      { heatLossPerMeter_W: r.heatLossPerMeter_W, length_m: 380, massFlow_kg_s: 1 },
    ]);
    expect(totalHeatLoss_W).toBeGreaterThan(6_800);
    expect(totalHeatLoss_W).toBeLessThan(8_400);
  });
});

describe("computeTemperatureDropAlongPath — Phase 5C", () => {
  it("empty path → zero loss + zero drop", () => {
    const { temperatureDrop_C, totalHeatLoss_W } =
      computeTemperatureDropAlongPath([]);
    expect(temperatureDrop_C).toBe(0);
    expect(totalHeatLoss_W).toBe(0);
  });

  it("multiple pipes with varying mass flow → sums per-segment ΔT correctly", () => {
    // A 2-segment trunk: 50 m at 0.5 kg/s, then 50 m at 0.3 kg/s
    // (a branch took some flow). q' = 20 W/m on both.
    //   ΔT_1 = (20·50) / (0.5·4187) = 0.478 K
    //   ΔT_2 = (20·50) / (0.3·4187) = 0.796 K
    //   Total = 1.274 K
    const { temperatureDrop_C, totalHeatLoss_W } =
      computeTemperatureDropAlongPath([
        { heatLossPerMeter_W: 20, length_m: 50, massFlow_kg_s: 0.5 },
        { heatLossPerMeter_W: 20, length_m: 50, massFlow_kg_s: 0.3 },
      ]);
    expect(totalHeatLoss_W).toBeCloseTo(2000, 0);
    expect(temperatureDrop_C).toBeGreaterThan(1.2);
    expect(temperatureDrop_C).toBeLessThan(1.35);
  });

  it("zero mass flow on a segment → no ΔT contribution from that segment (but loss still counts)", () => {
    const { temperatureDrop_C, totalHeatLoss_W } =
      computeTemperatureDropAlongPath([
        { heatLossPerMeter_W: 20, length_m: 100, massFlow_kg_s: 0 },
      ]);
    expect(totalHeatLoss_W).toBeCloseTo(2000, 0);
    expect(temperatureDrop_C).toBe(0);
  });

  it("custom c_p override (e.g. glycol mixture) flows through to ΔT", () => {
    // Glycol-water mix has c_p ≈ 3500 J/kg·K (vs 4187 for pure water).
    // Same q_total / lower c_p → larger ΔT. Sanity check the parameter
    // path; engineers occasionally model anti-freeze networks.
    const water = computeTemperatureDropAlongPath(
      [{ heatLossPerMeter_W: 20, length_m: 100, massFlow_kg_s: 0.5 }],
      4187,
    );
    const glycol = computeTemperatureDropAlongPath(
      [{ heatLossPerMeter_W: 20, length_m: 100, massFlow_kg_s: 0.5 }],
      3500,
    );
    expect(glycol.temperatureDrop_C).toBeGreaterThan(water.temperatureDrop_C);
  });
});

describe("computePipeHeatLoss — error guards", () => {
  it("throws when wall is thicker than half the OD (would give non-positive inner)", () => {
    expect(() =>
      computePipeHeatLoss({
        fluidTemp_C: 95,
        ambientTemp_C: -39,
        pipeOuterDiameter_mm: 50,
        pipeWallThickness_mm: 30,
        insulationThickness_mm: 50,
        installation: "air",
      }),
    ).toThrow(/pipeWallThickness/);
  });

  it("throws on shallow burial where shape factor breaks down", () => {
    // Carslaw-Jaeger formula needs 2H ≥ d_jacket. Pass a 1 cm burial
    // for a 17 cm jacket — the math would underflow the logarithm.
    expect(() =>
      computePipeHeatLoss({
        ...DN50,
        fluidTemp_C: 95,
        ambientTemp_C: 5,
        insulationThickness_mm: 50,
        installation: "buried",
        burialDepth_m: 0.01,
      }),
    ).toThrow(/burialDepth_m/);
  });
});
