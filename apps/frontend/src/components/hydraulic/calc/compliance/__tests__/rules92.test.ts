/**
 * Phase 9.2 — Extended hydraulic + thermal rule tests.
 *
 * 12 new rules × 2 scenarios (pass + fail) = 24 tests. Plus a
 * registry-size sanity check (8 + 12 = 20 rules total).
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

function makeNode(over: Partial<SchemeNode> & { id: string; kind: string }): SchemeNode {
  return { label: over.id, x: 0, y: 0, ...over };
}
function makePipe(over: Partial<SchemePipe> & { id: string; fromNodeId: string; toNodeId: string }): SchemePipe {
  return {
    materialKey: "steel_aged",
    dn: 100,
    length_m: 50,
    circuit: "heating_supply",
    ...over,
  };
}
function makeState(overrides?: Partial<HydraulicState>): HydraulicState {
  const s = { ...emptyState(), ...overrides };
  if (!s.nodes.length) {
    s.nodes = [
      makeNode({ id: "src", kind: "source_substation" }),
      makeNode({ id: "aos1", kind: "consumer_apartment" }),
    ];
    s.pipes = [makePipe({ id: "p1", fromNodeId: "src", toNodeId: "aos1" })];
  }
  return s;
}
function makeCalc(state: HydraulicState, over?: Partial<CalculationResults>): CalculationResults {
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
    totalLoad_w: 50_000,
    maxHeadlossPerMeter_pa: 50,
    maxVelocity_m_s: 1.5,
    minConsumerPressure_mpa: 0.25,
    computedAt: "2026-05-15T00:00:00Z",
    ...over,
  };
}

function violationsForRule(report: ReturnType<typeof runComplianceCheck>, ruleId: string) {
  return report.results.filter((r) => r.ruleId === ruleId);
}

/* ─── Registry sanity ──────────────────────────────────────────── */

describe("ALL_RULES registry — Phase 9.2", () => {
  it("contains 20 rules (8 from Phase 9.1 + 12 new)", () => {
    expect(ALL_RULES.length).toBe(20);
  });

  it("rule ids unique across registry", () => {
    const ids = ALL_RULES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("each rule has Mongolian name + standardRef", () => {
    for (const rule of ALL_RULES) {
      expect(rule.name.length).toBeGreaterThan(2);
      expect(rule.standardRef.length).toBeGreaterThan(2);
    }
  });
});

/* ─── Rule 9 — velocity_min_supply ─────────────────────────────── */

describe("Rule 9 — velocity_min_supply", () => {
  it("PASS: v = 1.5 → no info", () => {
    const s = makeState();
    const r = runComplianceCheck(s, makeCalc(s), ALL_RULES);
    expect(violationsForRule(r, "velocity_min_supply")).toHaveLength(0);
  });

  it("FAIL: v = 0.1 → INFO", () => {
    const s = makeState();
    const c = makeCalc(s);
    c.pipes[0]!.v_m_s = 0.1;
    const r = runComplianceCheck(s, c, ALL_RULES);
    const v = violationsForRule(r, "velocity_min_supply");
    expect(v).toHaveLength(1);
    expect(v[0]!.severity).toBe("info");
  });
});

/* ─── Rule 10 — reynolds_min ───────────────────────────────────── */

describe("Rule 10 — reynolds_min", () => {
  it("PASS: Re = 50000 → no violation", () => {
    const s = makeState();
    const r = runComplianceCheck(s, makeCalc(s), ALL_RULES);
    expect(violationsForRule(r, "reynolds_min")).toHaveLength(0);
  });

  it("FAIL: Re = 2000 → INFO", () => {
    const s = makeState();
    const c = makeCalc(s);
    c.pipes[0]!.Re = 2000;
    const r = runComplianceCheck(s, c, ALL_RULES);
    expect(violationsForRule(r, "reynolds_min")).toHaveLength(1);
  });
});

/* ─── Rule 11 — return_temp_max ────────────────────────────────── */

describe("Rule 11 — return_temp_max", () => {
  it("PASS: schedule 130_70 → no violation", () => {
    const s = makeState();
    s.settings.temperatureScheduleKey = "130_70";
    const r = runComplianceCheck(s, makeCalc(s), ALL_RULES);
    expect(violationsForRule(r, "return_temp_max")).toHaveLength(0);
  });

  it("FAIL: tsg_obr_c = 80°C → WARN", () => {
    const s = makeState();
    s.settings.tsg_obr_c = 80;
    const r = runComplianceCheck(s, makeCalc(s), ALL_RULES);
    expect(violationsForRule(r, "return_temp_max")).toHaveLength(1);
  });
});

/* ─── Rule 12 — temp_drop_min ──────────────────────────────────── */

describe("Rule 12 — temp_drop_min", () => {
  it("PASS: schedule 130_70 → Δt = 60 → no violation", () => {
    const s = makeState();
    s.settings.temperatureScheduleKey = "130_70";
    const r = runComplianceCheck(s, makeCalc(s), ALL_RULES);
    expect(violationsForRule(r, "temp_drop_min")).toHaveLength(0);
  });

  it("FAIL: schedule 85_75 (Δt = 10) → INFO", () => {
    const s = makeState();
    // Inject a non-standard schedule
    (s.settings as { temperatureScheduleKey: string }).temperatureScheduleKey = "85_75";
    const r = runComplianceCheck(s, makeCalc(s), ALL_RULES);
    expect(violationsForRule(r, "temp_drop_min")).toHaveLength(1);
  });
});

/* ─── Rule 13 — heat_loss_per_meter_max ────────────────────────── */

describe("Rule 13 — heat_loss_per_meter_max", () => {
  it("PASS: no heat-loss data → no violation", () => {
    const s = makeState();
    const r = runComplianceCheck(s, makeCalc(s), ALL_RULES);
    expect(violationsForRule(r, "heat_loss_per_meter_max")).toHaveLength(0);
  });

  it("FAIL: q' = 80 W/m → WARN", () => {
    const s = makeState();
    const c = makeCalc(s);
    c.pipes[0]!.heatLossPerMeter_W = 80;
    const r = runComplianceCheck(s, c, ALL_RULES);
    expect(violationsForRule(r, "heat_loss_per_meter_max")).toHaveLength(1);
  });
});

/* ─── Rule 14 — pump_head_reasonable ───────────────────────────── */

describe("Rule 14 — pump_head_reasonable", () => {
  it("PASS: H = 30m → no violation", () => {
    const s = makeState();
    const c = makeCalc(s);
    c.pump = { H_m: 30, Q_m3h: 20, P_kW: 3 };
    const r = runComplianceCheck(s, c, ALL_RULES);
    expect(violationsForRule(r, "pump_head_reasonable")).toHaveLength(0);
  });

  it("FAIL: H = 75m → WARN", () => {
    const s = makeState();
    const c = makeCalc(s);
    c.pump = { H_m: 75, Q_m3h: 20, P_kW: 8 };
    const r = runComplianceCheck(s, c, ALL_RULES);
    expect(violationsForRule(r, "pump_head_reasonable")).toHaveLength(1);
  });
});

/* ─── Rule 15 — pump_efficiency_min ────────────────────────────── */

describe("Rule 15 — pump_efficiency_min", () => {
  it("PASS: high P_kW → high efficiency → no violation", () => {
    const s = makeState();
    const c = makeCalc(s);
    // Ideal: ρ·g·Q·H = 1000 * 9.81 * (20/3600) * 30 ≈ 1635 W ≈ 1.635 kW
    // Set P = 2.4 kW → η ≈ 0.68 → no violation
    c.pump = {
      H_m: 30, Q_m3h: 20, P_kW: 2.4,
      breakdown: { supplyFriction_m: 10, returnFriction_m: 10, consumerReserve_m: 5, safetyMargin_m: 5 },
    };
    const r = runComplianceCheck(s, c, ALL_RULES);
    expect(violationsForRule(r, "pump_efficiency_min")).toHaveLength(0);
  });

  it("FAIL: low η = 0.4 → INFO", () => {
    const s = makeState();
    const c = makeCalc(s);
    // Set P high so eta is low
    c.pump = {
      H_m: 30, Q_m3h: 20, P_kW: 4.0,
      breakdown: { supplyFriction_m: 10, returnFriction_m: 10, consumerReserve_m: 5, safetyMargin_m: 5 },
    };
    const r = runComplianceCheck(s, c, ALL_RULES);
    expect(violationsForRule(r, "pump_efficiency_min")).toHaveLength(1);
  });
});

/* ─── Rule 16 — circuit_balance ────────────────────────────────── */

describe("Rule 16 — circuit_balance", () => {
  it("PASS: only supply pipes → skipped silently", () => {
    const s = makeState();
    const r = runComplianceCheck(s, makeCalc(s), ALL_RULES);
    expect(violationsForRule(r, "circuit_balance")).toHaveLength(0);
  });

  it("FAIL: 1 kg/s supply + 1.2 kg/s return → 20% imbalance → WARN", () => {
    const s = makeState();
    s.pipes = [
      makePipe({ id: "p1", fromNodeId: "src", toNodeId: "aos1", circuit: "heating_supply" }),
      makePipe({ id: "p2", fromNodeId: "aos1", toNodeId: "src", circuit: "heating_return" }),
    ];
    const c = makeCalc(s);
    c.pipes = [
      { pipeId: "p1", G_kg_s: 1.0, v_m_s: 1.5, Re: 50_000, lambda: 0.025, headlossPerMeter_pa: 50, totalPressureDrop_pa: 2500, iterations: 5 },
      { pipeId: "p2", G_kg_s: 1.2, v_m_s: 1.5, Re: 50_000, lambda: 0.025, headlossPerMeter_pa: 50, totalPressureDrop_pa: 2500, iterations: 5 },
    ];
    const r = runComplianceCheck(s, c, ALL_RULES);
    expect(violationsForRule(r, "circuit_balance")).toHaveLength(1);
  });
});

/* ─── Rule 17 — pipe_length_max_branch ─────────────────────────── */

describe("Rule 17 — pipe_length_max_branch", () => {
  it("PASS: L = 50m → no violation", () => {
    const s = makeState();
    const r = runComplianceCheck(s, makeCalc(s), ALL_RULES);
    expect(violationsForRule(r, "pipe_length_max_branch")).toHaveLength(0);
  });

  it("FAIL: L = 250m → INFO", () => {
    const s = makeState();
    s.pipes[0]!.length_m = 250;
    const r = runComplianceCheck(s, makeCalc(s), ALL_RULES);
    expect(violationsForRule(r, "pipe_length_max_branch")).toHaveLength(1);
  });
});

/* ─── Rule 18 — pipe_dn_decrease_along_flow ───────────────────── */

describe("Rule 18 — pipe_dn_decrease_along_flow", () => {
  it("PASS: DN100 → DN80 → no violation", () => {
    const s = makeState();
    s.nodes.push(makeNode({ id: "mid", kind: "junction" }));
    s.pipes = [
      makePipe({ id: "p1", fromNodeId: "src", toNodeId: "mid", dn: 100 }),
      makePipe({ id: "p2", fromNodeId: "mid", toNodeId: "aos1", dn: 80 }),
    ];
    const r = runComplianceCheck(s, makeCalc(s), ALL_RULES);
    expect(violationsForRule(r, "pipe_dn_decrease_along_flow")).toHaveLength(0);
  });

  it("FAIL: DN50 → DN100 antipattern → INFO", () => {
    const s = makeState();
    s.nodes.push(makeNode({ id: "mid", kind: "junction" }));
    s.pipes = [
      makePipe({ id: "p1", fromNodeId: "src", toNodeId: "mid", dn: 50 }),
      makePipe({ id: "p2", fromNodeId: "mid", toNodeId: "aos1", dn: 100 }),
    ];
    const r = runComplianceCheck(s, makeCalc(s), ALL_RULES);
    expect(violationsForRule(r, "pipe_dn_decrease_along_flow")).toHaveLength(1);
  });
});

/* ─── Rule 19 — insulation_thickness_min ──────────────────────── */

describe("Rule 19 — insulation_thickness_min", () => {
  it("PASS: DN100 + 40mm insulation → no violation", () => {
    const s = makeState();
    s.pipes[0]!.insulationThickness_mm = 40;
    const r = runComplianceCheck(s, makeCalc(s), ALL_RULES);
    expect(violationsForRule(r, "insulation_thickness_min")).toHaveLength(0);
  });

  it("FAIL: DN150 + 35mm insulation → WARN", () => {
    const s = makeState();
    s.pipes[0]!.dn = 150;
    s.pipes[0]!.insulationThickness_mm = 35; // < 50mm required for DN > 100
    const r = runComplianceCheck(s, makeCalc(s), ALL_RULES);
    expect(violationsForRule(r, "insulation_thickness_min")).toHaveLength(1);
  });
});

/* ─── Rule 20 — pipe_material_consistent ──────────────────────── */

describe("Rule 20 — pipe_material_consistent", () => {
  it("PASS: single material per circuit → no violation", () => {
    const s = makeState();
    const r = runComplianceCheck(s, makeCalc(s), ALL_RULES);
    expect(violationsForRule(r, "pipe_material_consistent")).toHaveLength(0);
  });

  it("FAIL: two materials in heating_supply → INFO", () => {
    const s = makeState();
    s.pipes = [
      makePipe({ id: "p1", fromNodeId: "src", toNodeId: "aos1", materialKey: "steel_aged" }),
      makePipe({ id: "p2", fromNodeId: "src", toNodeId: "aos1", materialKey: "ppr_pn25" }),
    ];
    const r = runComplianceCheck(s, makeCalc(s), ALL_RULES);
    expect(violationsForRule(r, "pipe_material_consistent")).toHaveLength(1);
  });
});
