/**
 * Phase 9.1 — Rule engine + 8 essential rules.
 *
 * Each rule gets 3 scenarios: PASS (no violation), THRESHOLD-VIOLATE
 * (one violation), and an extra context test for engineer-relevant
 * edge cases. Plus 1 engine test that confirms registry execution
 * order + sorting.
 */
import { describe, it, expect } from "vitest";
import {
  runComplianceCheck,
  compareSeverity,
  severityLabel,
  categoryLabel,
  type ComplianceReport,
} from "../ruleEngine";
import { ALL_RULES, COMPLIANCE_CONSTANTS } from "../rules";
import type {
  HydraulicState,
  CalculationResults,
  SchemeNode,
  SchemePipe,
} from "../../../hydraulicTypes";
import { emptyState } from "../../../hydraulicTypes";

/* ─── Fixtures ──────────────────────────────────────────────────── */

function makeState(overrides?: Partial<HydraulicState>): HydraulicState {
  return { ...emptyState(), ...overrides };
}

function makeNode(over: Partial<SchemeNode> & { id: string; kind: string }): SchemeNode {
  return {
    label: over.id,
    x: 0,
    y: 0,
    ...over,
  };
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

function makeCalc(over?: Partial<CalculationResults>): CalculationResults {
  return {
    pipes: [],
    nodes: [],
    totalLoad_w: 0,
    maxHeadlossPerMeter_pa: 0,
    maxVelocity_m_s: 0,
    minConsumerPressure_mpa: 0,
    computedAt: "2026-05-15T00:00:00Z",
    ...over,
  };
}

function basicProject(): HydraulicState {
  const s = makeState();
  s.nodes = [
    makeNode({ id: "src", kind: "source_substation", label: "ЦТП" }),
    makeNode({ id: "aos1", kind: "consumer_apartment", label: "АОС-1" }),
  ];
  s.pipes = [
    makePipe({ id: "p1", fromNodeId: "src", toNodeId: "aos1", dn: 100, length_m: 50 }),
  ];
  // Phase 9.3 — seed project-level metadata so the project-completeness
  // rules don't fire on the "clean project" fixture.
  s.settings.titleBlock = { engineer: "Болд", checker: "Сүх", company: "Гэрлэлт ХХК" };
  s.settings.printScale = "1:500";
  s.settings.printPaperSize = "A3";
  s.settings.printOrientation = "landscape";
  return s;
}

function cleanCalc(state: HydraulicState): CalculationResults {
  return makeCalc({
    pipes: state.pipes.map((p) => ({
      pipeId: p.id,
      G_kg_s: 1.0,
      v_m_s: 1.5,        // well within 3.5 m/s
      Re: 50_000,
      lambda: 0.025,
      headlossPerMeter_pa: 50, // well within 80 Pa/m
      totalPressureDrop_pa: 2500,
      iterations: 5,
    })),
    nodes: state.nodes.map((n) => ({
      nodeId: n.id,
      pressureAtNode_mpa: 0.25, // above 0.15 MPa floor
      heatLoad_w: 50_000,
      supplyTemp_C_at_inlet: 90, // above 80°C floor
    })),
  });
}

/* ─── Severity helpers ─────────────────────────────────────────── */

describe("severity helpers", () => {
  it("compareSeverity orders critical < error < warn < info", () => {
    expect(compareSeverity("critical", "error")).toBeLessThan(0);
    expect(compareSeverity("error", "warn")).toBeLessThan(0);
    expect(compareSeverity("warn", "info")).toBeLessThan(0);
    expect(compareSeverity("info", "critical")).toBeGreaterThan(0);
    expect(compareSeverity("error", "error")).toBe(0);
  });

  it("severityLabel returns Mongolian", () => {
    expect(severityLabel("critical")).toMatch(/Чухал/);
    expect(severityLabel("error")).toMatch(/Алдаа/);
    expect(severityLabel("warn")).toMatch(/Анхааруулга/);
    expect(severityLabel("info")).toMatch(/Мэдээлэл/);
  });

  it("categoryLabel returns Mongolian", () => {
    expect(categoryLabel("hydraulics")).toBe("Гидравлик");
    expect(categoryLabel("thermal")).toBe("Дулааны");
    expect(categoryLabel("geometry")).toBe("Геометр");
    expect(categoryLabel("materials")).toBe("Материал");
    expect(categoryLabel("project")).toBe("Төсөл");
  });
});

/* ─── Engine ──────────────────────────────────────────────────── */

describe("runComplianceCheck — engine", () => {
  it("clean project returns 0 violations + all rules passed", () => {
    const s = basicProject();
    const r = runComplianceCheck(s, cleanCalc(s), ALL_RULES);
    expect(r.summary.totalViolations).toBe(0);
    expect(r.summary.passedRules).toBe(ALL_RULES.length);
  });

  it("sorts results: critical → error → warn → info", () => {
    const s = basicProject();
    // Force multiple violations across severities
    const calc = cleanCalc(s);
    calc.pipes[0]!.v_m_s = 4.0;         // ERROR
    calc.pipes[0]!.headlossPerMeter_pa = 100; // WARN
    calc.nodes[1]!.pressureAtNode_mpa = 0.10;  // CRITICAL
    calc.nodes[1]!.supplyTemp_C_at_inlet = 75; // WARN
    s.pipes[0]!.dn = 47;                // INFO (non-standard)
    const r = runComplianceCheck(s, calc, ALL_RULES);
    const severities = r.results.map((x) => x.severity);
    for (let i = 1; i < severities.length; i += 1) {
      expect(compareSeverity(severities[i - 1]!, severities[i]!)).toBeLessThanOrEqual(0);
    }
  });

  it("rulesChecked array carries metadata for PDF renderer", () => {
    const s = basicProject();
    const r = runComplianceCheck(s, cleanCalc(s), ALL_RULES);
    expect(r.rulesChecked.length).toBe(ALL_RULES.length);
    expect(r.rulesChecked[0]).toHaveProperty("id");
    expect(r.rulesChecked[0]).toHaveProperty("name");
    expect(r.rulesChecked[0]).toHaveProperty("standardRef");
  });

  it("buggy rule check doesn't take down the report", () => {
    const buggyRule = {
      id: "buggy",
      category: "project" as const,
      severity: "info" as const,
      name: "Алдаатай дүрэм",
      description: "throws",
      standardRef: "internal",
      check() { throw new Error("kaboom"); },
    };
    const r = runComplianceCheck(basicProject(), undefined, [buggyRule]);
    expect(r.results.length).toBe(1);
    expect(r.results[0]!.message).toMatch(/kaboom|Дотоод алдаа/);
  });

  it("calc undefined → hydraulic rules silently emit nothing", () => {
    const s = basicProject();
    const r: ComplianceReport = runComplianceCheck(s, undefined, ALL_RULES);
    // Only project-level rules can fire — and basicProject has src + consumer
    expect(r.summary.critical).toBe(0);
    expect(r.summary.error).toBe(0);
  });
});

/* ─── Rule 1: velocity_max_supply ──────────────────────────────── */

describe("Rule 1 — velocity_max_supply", () => {
  it("PASS: v = 1.5 m/s on supply pipe → no violation", () => {
    const s = basicProject();
    const r = runComplianceCheck(s, cleanCalc(s), ALL_RULES);
    expect(r.results.filter((x) => x.ruleId === "velocity_max_supply")).toHaveLength(0);
  });

  it("FAIL: v = 4.0 m/s → 1 ERROR violation", () => {
    const s = basicProject();
    const c = cleanCalc(s);
    c.pipes[0]!.v_m_s = 4.0;
    const r = runComplianceCheck(s, c, ALL_RULES);
    const v = r.results.filter((x) => x.ruleId === "velocity_max_supply");
    expect(v).toHaveLength(1);
    expect(v[0]!.severity).toBe("error");
    expect(v[0]!.entityId).toBe("p1");
  });

  it("CONTEXT: return pipes don't trigger supply rule", () => {
    const s = basicProject();
    s.pipes[0]!.circuit = "heating_return";
    const c = cleanCalc(s);
    c.pipes[0]!.v_m_s = 4.0;
    const r = runComplianceCheck(s, c, ALL_RULES);
    expect(r.results.filter((x) => x.ruleId === "velocity_max_supply")).toHaveLength(0);
  });
});

/* ─── Rule 2: velocity_max_return ──────────────────────────────── */

describe("Rule 2 — velocity_max_return", () => {
  it("PASS: return v = 1.5 → no violation", () => {
    const s = basicProject();
    s.pipes[0]!.circuit = "heating_return";
    const r = runComplianceCheck(s, cleanCalc(s), ALL_RULES);
    expect(r.results.filter((x) => x.ruleId === "velocity_max_return")).toHaveLength(0);
  });

  it("FAIL: return v = 4.2 → 1 ERROR", () => {
    const s = basicProject();
    s.pipes[0]!.circuit = "heating_return";
    const c = cleanCalc(s);
    c.pipes[0]!.v_m_s = 4.2;
    const r = runComplianceCheck(s, c, ALL_RULES);
    const v = r.results.filter((x) => x.ruleId === "velocity_max_return");
    expect(v).toHaveLength(1);
    expect(v[0]!.severity).toBe("error");
  });
});

/* ─── Rule 3: pressure_loss_max ────────────────────────────────── */

describe("Rule 3 — pressure_loss_max", () => {
  it("PASS: R = 50 Pa/m → no violation", () => {
    const s = basicProject();
    const r = runComplianceCheck(s, cleanCalc(s), ALL_RULES);
    expect(r.results.filter((x) => x.ruleId === "pressure_loss_max")).toHaveLength(0);
  });

  it("FAIL: R = 100 Pa/m → 1 WARN", () => {
    const s = basicProject();
    const c = cleanCalc(s);
    c.pipes[0]!.headlossPerMeter_pa = 100;
    const r = runComplianceCheck(s, c, ALL_RULES);
    const v = r.results.filter((x) => x.ruleId === "pressure_loss_max");
    expect(v).toHaveLength(1);
    expect(v[0]!.severity).toBe("warn");
  });
});

/* ─── Rule 4: consumer_pressure_min ────────────────────────────── */

describe("Rule 4 — consumer_pressure_min", () => {
  it("PASS: Δp = 0.25 MPa → no violation", () => {
    const s = basicProject();
    const r = runComplianceCheck(s, cleanCalc(s), ALL_RULES);
    expect(r.results.filter((x) => x.ruleId === "consumer_pressure_min")).toHaveLength(0);
  });

  it("FAIL: Δp = 0.10 MPa → CRITICAL", () => {
    const s = basicProject();
    const c = cleanCalc(s);
    c.nodes[1]!.pressureAtNode_mpa = 0.10;
    const r = runComplianceCheck(s, c, ALL_RULES);
    const v = r.results.filter((x) => x.ruleId === "consumer_pressure_min");
    expect(v).toHaveLength(1);
    expect(v[0]!.severity).toBe("critical");
    expect(v[0]!.entityId).toBe("aos1");
  });

  it("CONTEXT: per-consumer requiredPressure_mpa override", () => {
    const s = basicProject();
    s.nodes[1]!.requiredPressure_mpa = 0.3;
    const c = cleanCalc(s);
    c.nodes[1]!.pressureAtNode_mpa = 0.25;
    const r = runComplianceCheck(s, c, ALL_RULES);
    const v = r.results.filter((x) => x.ruleId === "consumer_pressure_min");
    expect(v).toHaveLength(1); // 0.25 < 0.3 fires the rule
  });
});

/* ─── Rule 5: supply_temp_min ──────────────────────────────────── */

describe("Rule 5 — supply_temp_min", () => {
  it("PASS: 90°C → no violation", () => {
    const s = basicProject();
    const r = runComplianceCheck(s, cleanCalc(s), ALL_RULES);
    expect(r.results.filter((x) => x.ruleId === "supply_temp_min")).toHaveLength(0);
  });

  it("FAIL: 75°C → 1 WARN", () => {
    const s = basicProject();
    const c = cleanCalc(s);
    c.nodes[1]!.supplyTemp_C_at_inlet = 75;
    const r = runComplianceCheck(s, c, ALL_RULES);
    const v = r.results.filter((x) => x.ruleId === "supply_temp_min");
    expect(v).toHaveLength(1);
    expect(v[0]!.severity).toBe("warn");
  });

  it("CONTEXT: settings.minSupplyTemp_c override", () => {
    const s = basicProject();
    s.settings.minSupplyTemp_c = 70;
    const c = cleanCalc(s);
    c.nodes[1]!.supplyTemp_C_at_inlet = 72;
    const r = runComplianceCheck(s, c, ALL_RULES);
    // 72 > 70 override → no violation
    expect(r.results.filter((x) => x.ruleId === "supply_temp_min")).toHaveLength(0);
  });
});

/* ─── Rule 6: pipe_dn_minimum ─────────────────────────────────── */

describe("Rule 6 — pipe_dn_minimum", () => {
  it("PASS: DN 100 → no violation", () => {
    const s = basicProject();
    const r = runComplianceCheck(s, cleanCalc(s), ALL_RULES);
    expect(r.results.filter((x) => x.ruleId === "pipe_dn_minimum")).toHaveLength(0);
  });

  it("FAIL: DN 47 → 1 INFO", () => {
    const s = basicProject();
    s.pipes[0]!.dn = 47;
    const r = runComplianceCheck(s, cleanCalc(s), ALL_RULES);
    const v = r.results.filter((x) => x.ruleId === "pipe_dn_minimum");
    expect(v).toHaveLength(1);
    expect(v[0]!.severity).toBe("info");
  });

  it("STANDARD_DN_MM has 14 sizes", () => {
    expect(COMPLIANCE_CONSTANTS.STANDARD_DN_MM.size).toBe(14);
  });
});

/* ─── Rule 7: source_node_exists ──────────────────────────────── */

describe("Rule 7 — source_node_exists", () => {
  it("PASS: 1 source → no violation", () => {
    const s = basicProject();
    const r = runComplianceCheck(s, cleanCalc(s), ALL_RULES);
    expect(r.results.filter((x) => x.ruleId === "source_node_exists")).toHaveLength(0);
  });

  it("FAIL: 0 sources → 1 CRITICAL", () => {
    const s = basicProject();
    s.nodes = s.nodes.filter((n) => !n.kind.startsWith("source_"));
    const r = runComplianceCheck(s, undefined, ALL_RULES);
    const v = r.results.filter((x) => x.ruleId === "source_node_exists");
    expect(v).toHaveLength(1);
    expect(v[0]!.severity).toBe("critical");
  });

  it("CONTEXT: source_boiler also counts", () => {
    const s = basicProject();
    s.nodes[0]!.kind = "source_boiler";
    const r = runComplianceCheck(s, undefined, ALL_RULES);
    expect(r.results.filter((x) => x.ruleId === "source_node_exists")).toHaveLength(0);
  });
});

/* ─── Rule 8: consumer_node_exists ────────────────────────────── */

describe("Rule 8 — consumer_node_exists", () => {
  it("PASS: 1 consumer → no violation", () => {
    const s = basicProject();
    const r = runComplianceCheck(s, undefined, ALL_RULES);
    expect(r.results.filter((x) => x.ruleId === "consumer_node_exists")).toHaveLength(0);
  });

  it("FAIL: 0 consumers → 1 ERROR", () => {
    const s = basicProject();
    s.nodes = s.nodes.filter((n) => !n.kind.startsWith("consumer_"));
    const r = runComplianceCheck(s, undefined, ALL_RULES);
    const v = r.results.filter((x) => x.ruleId === "consumer_node_exists");
    expect(v).toHaveLength(1);
    expect(v[0]!.severity).toBe("error");
  });

  it("CONTEXT: consumer_school + consumer_industrial both count", () => {
    const s = basicProject();
    s.nodes[1]!.kind = "consumer_school";
    s.nodes.push(makeNode({ id: "aob1", kind: "consumer_industrial", label: "АОБ-1" }));
    const r = runComplianceCheck(s, undefined, ALL_RULES);
    expect(r.results.filter((x) => x.ruleId === "consumer_node_exists")).toHaveLength(0);
  });
});
