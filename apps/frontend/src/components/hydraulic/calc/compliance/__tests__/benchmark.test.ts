/**
 * Phase 11.3 — Compliance engine benchmark tests.
 *
 * Asserts that the 30-rule pass over a 1000-node synthetic network
 * completes within the Phase 11.3 performance target (< 2s).
 *
 * On modern dev hardware the actual time is usually 30-200ms; the
 * 2s ceiling is the engineer-visible SLA the spec set. If this
 * test ever exceeds the ceiling, that's a real regression worth
 * investigating before merge.
 *
 * The benchmark runs SYNCHRONOUSLY on the main thread (the Web
 * Worker integration is exercised in production but skipped here
 * because jsdom doesn't ship Worker).
 */
import { describe, it, expect } from "vitest";
import { runComplianceCheck } from "../ruleEngine";
import { ALL_RULES } from "../rules";
import type {
  HydraulicState,
  CalculationResults,
  SchemeNode,
  SchemePipe,
} from "../../../hydraulicTypes";
import { emptyState } from "../../../hydraulicTypes";

/* ─── Synthetic 1000-node fixture ───────────────────────────────── */

function synthetic1000NodeProject(): HydraulicState {
  const s = emptyState();
  // 1 source + 999 consumers via a wagon-wheel topology
  const nodes: SchemeNode[] = [
    { id: "src", kind: "source_substation", label: "ЦТП", x: 0, y: 0 },
  ];
  const pipes: SchemePipe[] = [];
  // Add 999 consumers + 999 pipes from source to each
  for (let i = 1; i <= 999; i += 1) {
    const angle = (i / 999) * 2 * Math.PI;
    nodes.push({
      id: `c${i}`,
      kind: "consumer_apartment",
      label: `АОС-${i}`,
      x: Math.cos(angle) * 1000,
      y: Math.sin(angle) * 1000,
      // Phase 13.40 — consumerHeatLoadRequired demands a non-zero
      // load on every consumer; seed it on the synthetic fixture
      // so the benchmark counts the rule as "passed" instead of
      // emitting 999 INFO violations.
      heatLoad_w: 50_000,
    });
    pipes.push({
      id: `p${i}`,
      fromNodeId: "src",
      toNodeId: `c${i}`,
      materialKey: "steel_aged",
      dn: 100,
      length_m: 50,
      circuit: "heating_supply",
    });
  }
  s.nodes = nodes;
  s.pipes = pipes;
  // Seed project metadata so project-completeness rules pass
  s.settings = {
    ...s.settings,
    titleBlock: { engineer: "Б", checker: "С", company: "Co" },
    printScale: "1:500",
    printPaperSize: "A3",
    printOrientation: "landscape",
  };
  return s;
}

function syntheticCalc(state: HydraulicState): CalculationResults {
  return {
    pipes: state.pipes.map((p) => ({
      pipeId: p.id,
      G_kg_s: 1.0,
      v_m_s: 1.5,
      Re: 50_000,
      lambda: 0.025,
      headlossPerMeter_pa: 50,
      totalPressureDrop_pa: 2500,
      iterations: 5,
    })),
    nodes: state.nodes.map((n) => ({
      nodeId: n.id,
      pressureAtNode_mpa: 0.25,
      heatLoad_w: 50_000,
      supplyTemp_C_at_inlet: 90,
    })),
    totalLoad_w: 50_000 * 999,
    maxHeadlossPerMeter_pa: 50,
    maxVelocity_m_s: 1.5,
    minConsumerPressure_mpa: 0.25,
    computedAt: new Date().toISOString(),
  };
}

/* ─── Benchmark assertions ─────────────────────────────────────── */

describe("Compliance engine benchmark — Phase 11.3", () => {
  it("1000-node clean network: 30 rules complete < 2000ms (sync main-thread)", () => {
    const project = synthetic1000NodeProject();
    const calc = syntheticCalc(project);
    const t0 = performance.now();
    const report = runComplianceCheck(project, calc, ALL_RULES);
    const t1 = performance.now();
    const elapsed = t1 - t0;
    // The 2s ceiling is the Phase 11.3 SLA. On dev hardware the
    // actual is usually 30-200ms.
    expect(elapsed).toBeLessThan(2000);
    // Sanity: the report should still be correct. Wagon-wheel
    // topology triggers a small handful of rule firings (e.g.
    // well_at_branches on the source's 999-pipe junction) — we just
    // assert the engine completes coherently.
    expect(report.summary.passedRules + report.summary.totalViolations).toBe(ALL_RULES.length);
  });

  it("1000-node network with broken velocities: < 2s + correct violation count", () => {
    const project = synthetic1000NodeProject();
    const calc = syntheticCalc(project);
    // Trigger velocity violations on every pipe
    calc.pipes.forEach((p) => { p.v_m_s = 5.0; });
    const t0 = performance.now();
    const report = runComplianceCheck(project, calc, ALL_RULES);
    const t1 = performance.now();
    expect(t1 - t0).toBeLessThan(2000);
    // Each of 999 supply pipes triggers velocity_max_supply → 999 violations
    const velViolations = report.results.filter((r) => r.ruleId === "velocity_max_supply");
    expect(velViolations.length).toBe(999);
  });

  it("100-node network completes in < 200ms (typical engineer project size)", () => {
    const project = synthetic1000NodeProject();
    project.nodes = project.nodes.slice(0, 101);
    project.pipes = project.pipes.slice(0, 100);
    const calc = syntheticCalc(project);
    const t0 = performance.now();
    runComplianceCheck(project, calc, ALL_RULES);
    const t1 = performance.now();
    expect(t1 - t0).toBeLessThan(200);
  });
});
