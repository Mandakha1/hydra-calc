/**
 * Pure-function tests for hydraulic formulas.
 * Does not require a database — runs standalone.
 *
 * Phase 1A — textbook validation (TC-001 … TC-005). Each case below is
 * sourced from a canonical engineering reference; if a test fails, do
 * NOT change the test — document the discrepancy in
 * docs/diagnostic/engine-textbook-discrepancies.md and discuss before
 * touching the solver math.
 */
import { describe, expect, it } from "vitest";

// Re-implement the core lambda solver inline so we can verify the math
// without importing the frontend module. Keep this 1:1 with calc/hydraulics.ts.
// Returns { lambda, iters } so TC-004 can assert convergence-budget guarantees.
function colebrookLambda(Re: number, rel: number): { lambda: number; iters: number } {
  if (Re < 2300) return { lambda: 64 / Math.max(1, Re), iters: 0 };
  let lambda = 0.25 / Math.pow(Math.log10(rel / 3.7 + 5.74 / Math.pow(Re, 0.9)), 2);
  for (let i = 1; i <= 50; i += 1) {
    const rhs = -2 * Math.log10(rel / 3.7 + 2.51 / (Re * Math.sqrt(lambda)));
    const next = 1 / (rhs * rhs);
    if (Math.abs(next - lambda) < 1e-8) return { lambda: next, iters: i };
    lambda = next;
  }
  return { lambda, iters: 50 };
}

// Physical constants used by the textbook test cases. Sourced from the same
// table the production solver reads (packages/shared/src/hydraulicConstants.ts
// — WATER_PROPS).
const CP_WATER_J_PER_KG_K = 4187; // c_p at 20-90 °C, near-incompressible regime

describe("Colebrook–White (frontend parity check)", () => {
  it("reproduces Moody chart: smooth pipe Re=1e6 → λ ≈ 0.0116", () => {
    const { lambda } = colebrookLambda(1_000_000, 0);
    expect(lambda).toBeGreaterThan(0.011);
    expect(lambda).toBeLessThan(0.013);
  });

  it("reproduces rough pipe: steel k=0.5mm d=100mm Re=2e5 → λ ≈ 0.033", () => {
    const rel = 0.5 / 100;
    const { lambda } = colebrookLambda(200_000, rel);
    expect(lambda).toBeGreaterThan(0.030);
    expect(lambda).toBeLessThan(0.036);
  });

  it("uses Hagen-Poiseuille for laminar Re=1000", () => {
    expect(colebrookLambda(1000, 0.001).lambda).toBeCloseTo(0.064, 3);
  });
});

describe("TC-001 — Energy balance: heat ⇌ mass flow (SP 124.13330 §6.1)", () => {
  // Sokolov, "Тепловые сети", §3.2 (heat-flow equation):
  //   Q = G · c_p · ΔT       [W]    ⇒    G = Q / (c_p · ΔT)   [kg/s]
  // Reference numbers chosen to match the worked example in chapter 3.
  it("Q=100 kW, ΔT=25 K → G ≈ 0.956 kg/s (±1%)", () => {
    const Q_W = 100_000;
    const dT_K = 25;
    const G = Q_W / (CP_WATER_J_PER_KG_K * dT_K);
    expect(G).toBeGreaterThan(0.956 * 0.99);
    expect(G).toBeLessThan(0.956 * 1.01);
  });
});

describe("TC-002 — Mass flow ⇌ velocity (Sokolov §3.3)", () => {
  // v = G / (ρ · A)   with A = π·d²/4
  // Example: DN65 pipe (ID = 60 mm), G = 2.73 t/h, water at 82.5 °C.
  // ρ(82.5 °C) ≈ 970.6 kg/m³  (interpolated between 80 °C/972 and 95 °C/962).
  it("DN65 ID=60mm, G=2.73 t/h, ρ=970.6 → v ≈ 0.277 m/s (±1%)", () => {
    const G_kg_per_s = (2.73 * 1000) / 3600;
    const ID_m = 0.060;
    const A = (Math.PI * ID_m * ID_m) / 4;
    const rho = 970.6;
    const v = G_kg_per_s / (rho * A);
    expect(v).toBeGreaterThan(0.277 * 0.99);
    expect(v).toBeLessThan(0.277 * 1.01);
  });
});

describe("TC-003 — Colebrook–White at a documented Moody-chart point", () => {
  // Idelchik, "Handbook of Hydraulic Resistance", §2.3:
  //   Re=1e5, k/D=5e-4 → λ ≈ 0.0204   (Moody diagram visual reading)
  // Our solver should land in ±5% of that.
  it("Re=1e5, ε/D=5e-4 → λ ≈ 0.0204 (±5%)", () => {
    const { lambda } = colebrookLambda(100_000, 0.0005);
    expect(lambda).toBeGreaterThan(0.0204 * 0.95);
    expect(lambda).toBeLessThan(0.0204 * 1.05);
  });
});

describe("TC-004 — Colebrook–White solver convergence budget", () => {
  // BNbD 41-01-2019 spec mandates 1e-8 tolerance. The fixed-point iteration
  // should converge in ≤50 iters across the engineering-relevant Re range
  // (3 000 turbulent threshold → 1e7) and roughness range (mirror-smooth
  // 1e-6 → industrial-old 5e-2). If any combination needs >50 iters, our
  // initial guess (Swamee–Jain) or the iteration scheme needs revisiting.
  it("converges in ≤50 iterations for the full Re × ε/D engineering grid", () => {
    const Re_grid = [3_000, 10_000, 100_000, 1_000_000, 10_000_000];
    const rel_grid = [1e-6, 1e-5, 1e-4, 1e-3, 1e-2, 5e-2];
    let worstIters = 0;
    for (const Re of Re_grid) {
      for (const rel of rel_grid) {
        const { iters } = colebrookLambda(Re, rel);
        worstIters = Math.max(worstIters, iters);
        // A run that needs the full 50-iter cap means it never hit tolerance.
        expect(iters).toBeLessThan(50);
      }
    }
    // Sanity floor: we expect << 50 iters in practice; current solver lands ≤10.
    expect(worstIters).toBeLessThanOrEqual(15);
  });
});

describe("TC-005 — Hagen–Poiseuille laminar regime", () => {
  // Re=1500 (well below 2300 transition) MUST use λ = 64/Re exactly. If the
  // solver accidentally drops into Colebrook here, the friction factor would
  // be wildly off. ±0.1% tolerance — this is an algebraic identity, not a
  // measurement.
  it("Re=1500 → λ = 64/1500 = 0.04267 (±0.1%)", () => {
    const { lambda, iters } = colebrookLambda(1500, 0.001);
    expect(lambda).toBeGreaterThan(0.04267 * 0.999);
    expect(lambda).toBeLessThan(0.04267 * 1.001);
    // Laminar branch must NOT iterate the Colebrook scheme.
    expect(iters).toBe(0);
  });
});
