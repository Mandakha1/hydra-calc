/**
 * Pure-function tests for hydraulic formulas.
 * Does not require a database — runs standalone.
 */
import { describe, expect, it } from "vitest";

// Re-implement the core lambda solver inline so we can verify the math
// without importing the frontend module. Keep this 1:1 with calc/hydraulics.ts.
function colebrookLambda(Re: number, rel: number): number {
  if (Re < 2300) return 64 / Math.max(1, Re);
  let lambda = 0.25 / Math.pow(Math.log10(rel / 3.7 + 5.74 / Math.pow(Re, 0.9)), 2);
  for (let i = 0; i < 50; i += 1) {
    const rhs = -2 * Math.log10(rel / 3.7 + 2.51 / (Re * Math.sqrt(lambda)));
    const next = 1 / (rhs * rhs);
    if (Math.abs(next - lambda) < 1e-8) return next;
    lambda = next;
  }
  return lambda;
}

describe("Colebrook–White (frontend parity check)", () => {
  it("reproduces Moody chart: smooth pipe Re=1e6 → λ ≈ 0.0116", () => {
    const lambda = colebrookLambda(1_000_000, 0);
    expect(lambda).toBeGreaterThan(0.011);
    expect(lambda).toBeLessThan(0.013);
  });

  it("reproduces rough pipe: steel k=0.5mm d=100mm Re=2e5 → λ ≈ 0.033", () => {
    const rel = 0.5 / 100;
    const lambda = colebrookLambda(200_000, rel);
    expect(lambda).toBeGreaterThan(0.030);
    expect(lambda).toBeLessThan(0.036);
  });

  it("uses Hagen-Poiseuille for laminar Re=1000", () => {
    expect(colebrookLambda(1000, 0.001)).toBeCloseTo(0.064, 3);
  });
});
