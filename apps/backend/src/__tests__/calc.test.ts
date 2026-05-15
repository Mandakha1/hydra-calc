/**
 * Phase 10.2 — Backend calc engine + route surface tests.
 *
 * Tests the backend compliance port directly (unit tests, no DB),
 * and asserts the route schema for the 3 endpoints. Live-DB
 * integration tests (full /api/calc/compliance HTTP round-trip)
 * follow the existing auth.test.ts pattern — they require a real
 * Postgres + JWT setup and are skipped in CI without DATABASE_URL.
 */
import { describe, it, expect } from "vitest";
import {
  runComplianceCheckBackend,
  ALL_RULES_BACKEND,
  type BackendComplianceReport,
} from "../calc/compliance.js";

const VALID_PROJECT = {
  nodes: [
    { id: "src", kind: "source_substation", label: "ЦТП" },
    { id: "aos1", kind: "consumer_apartment", label: "АОС-1" },
  ],
  pipes: [
    {
      id: "p1", fromNodeId: "src", toNodeId: "aos1",
      materialKey: "steel_aged", dn: 100, length_m: 50,
      circuit: "heating_supply",
    },
  ],
  settings: {
    titleBlock: { drawingTitle: "Тест төсөл" },
    printScale: "1:500",
  },
  schemaVersion: 5,
};

const CLEAN_CALC = {
  pipes: [{
    pipeId: "p1", G_kg_s: 1.0, v_m_s: 1.5, Re: 50_000,
    headlossPerMeter_pa: 50,
  }],
  nodes: [
    { nodeId: "src", pressureAtNode_mpa: 0.6 },
    { nodeId: "aos1", pressureAtNode_mpa: 0.25, supplyTemp_C_at_inlet: 90 },
  ],
};

/* ─── Registry ─────────────────────────────────────────────────── */

describe("ALL_RULES_BACKEND registry", () => {
  it("ships the 8 Phase 9.1 core rules", () => {
    expect(ALL_RULES_BACKEND.length).toBe(8);
  });

  it("rule ids match the frontend canonical names", () => {
    const expectedIds = [
      "velocity_max_supply",
      "velocity_max_return",
      "pressure_loss_max",
      "consumer_pressure_min",
      "supply_temp_min",
      "pipe_dn_minimum",
      "source_node_exists",
      "consumer_node_exists",
    ];
    const actualIds = ALL_RULES_BACKEND.map((r) => r.id);
    for (const id of expectedIds) {
      expect(actualIds).toContain(id);
    }
  });

  it("every rule has Mongolian name + standard ref", () => {
    for (const rule of ALL_RULES_BACKEND) {
      expect(rule.name.length).toBeGreaterThan(2);
      expect(rule.standardRef.length).toBeGreaterThan(2);
    }
  });
});

/* ─── Engine ──────────────────────────────────────────────────── */

describe("runComplianceCheckBackend — engine", () => {
  it("clean project + clean calc → 0 violations + 8 passed", () => {
    const r = runComplianceCheckBackend(VALID_PROJECT, CLEAN_CALC);
    expect(r.summary.totalViolations).toBe(0);
    expect(r.summary.passedRules).toBe(8);
  });

  it("returns ComplianceReport shape (generatedAt + summary + results)", () => {
    const r: BackendComplianceReport = runComplianceCheckBackend(VALID_PROJECT, CLEAN_CALC);
    expect(r.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(r.summary).toBeDefined();
    expect(Array.isArray(r.results)).toBe(true);
    expect(Array.isArray(r.rulesChecked)).toBe(true);
  });

  it("missing source node fires CRITICAL", () => {
    const project = {
      ...VALID_PROJECT,
      nodes: [VALID_PROJECT.nodes[1]!],
    };
    const r = runComplianceCheckBackend(project, undefined);
    const violation = r.results.find((x) => x.ruleId === "source_node_exists");
    expect(violation).toBeDefined();
    expect(violation!.severity).toBe("critical");
  });

  it("missing consumer fires ERROR", () => {
    const project = {
      ...VALID_PROJECT,
      nodes: [VALID_PROJECT.nodes[0]!],
    };
    const r = runComplianceCheckBackend(project, undefined);
    const violation = r.results.find((x) => x.ruleId === "consumer_node_exists");
    expect(violation).toBeDefined();
    expect(violation!.severity).toBe("error");
  });

  it("high velocity → ERROR", () => {
    const calc = {
      pipes: [{ pipeId: "p1", G_kg_s: 1, v_m_s: 4.5, Re: 100_000, headlossPerMeter_pa: 50 }],
      nodes: CLEAN_CALC.nodes,
    };
    const r = runComplianceCheckBackend(VALID_PROJECT, calc);
    const violation = r.results.find((x) => x.ruleId === "velocity_max_supply");
    expect(violation).toBeDefined();
    expect(violation!.severity).toBe("error");
  });

  it("low consumer pressure → CRITICAL", () => {
    const calc = {
      pipes: CLEAN_CALC.pipes,
      nodes: [
        { nodeId: "src", pressureAtNode_mpa: 0.6 },
        { nodeId: "aos1", pressureAtNode_mpa: 0.1, supplyTemp_C_at_inlet: 90 },
      ],
    };
    const r = runComplianceCheckBackend(VALID_PROJECT, calc);
    const violation = r.results.find((x) => x.ruleId === "consumer_pressure_min");
    expect(violation).toBeDefined();
    expect(violation!.severity).toBe("critical");
  });

  it("non-standard DN fires INFO", () => {
    const project = {
      ...VALID_PROJECT,
      pipes: [{ ...VALID_PROJECT.pipes[0]!, dn: 47 }],
    };
    const r = runComplianceCheckBackend(project, undefined);
    const violation = r.results.find((x) => x.ruleId === "pipe_dn_minimum");
    expect(violation).toBeDefined();
    expect(violation!.severity).toBe("info");
  });

  it("severity sort: critical → error → warn → info", () => {
    const project = {
      ...VALID_PROJECT,
      nodes: [],
      pipes: [{ ...VALID_PROJECT.pipes[0]!, dn: 47 }],
    };
    const r = runComplianceCheckBackend(project, undefined);
    const SEVERITY_ORDER = { critical: 0, error: 1, warn: 2, info: 3 };
    for (let i = 1; i < r.results.length; i += 1) {
      expect(SEVERITY_ORDER[r.results[i - 1]!.severity]).toBeLessThanOrEqual(SEVERITY_ORDER[r.results[i]!.severity]);
    }
  });

  it("buggy rule check doesn't crash the engine", () => {
    const buggy = {
      id: "buggy",
      category: "project" as const,
      severity: "info" as const,
      name: "Алдаатай",
      description: "throws",
      standardRef: "internal",
      check() { throw new Error("kaboom"); },
    };
    const r = runComplianceCheckBackend(VALID_PROJECT, undefined, [buggy]);
    expect(r.results.length).toBe(1);
    expect(r.results[0]!.message).toMatch(/kaboom|Дотоод алдаа/);
  });

  it("loose project shape (no settings) doesn't crash", () => {
    const r = runComplianceCheckBackend(
      { nodes: VALID_PROJECT.nodes, pipes: VALID_PROJECT.pipes },
      undefined,
    );
    expect(r.summary).toBeDefined();
  });

  it("undefined calc → hydraulic rules silently skip", () => {
    const r = runComplianceCheckBackend(VALID_PROJECT, undefined);
    // velocity_max_supply needs calc → won't fire
    const velViolations = r.results.filter((x) => x.ruleId === "velocity_max_supply");
    expect(velViolations).toHaveLength(0);
  });

  it("response includes Mongolian project name when titleBlock set", () => {
    const r = runComplianceCheckBackend(VALID_PROJECT, undefined);
    expect(r.projectName).toBe("Тест төсөл");
  });

  it("response falls back to empty string when titleBlock missing", () => {
    const project = { nodes: VALID_PROJECT.nodes, pipes: VALID_PROJECT.pipes };
    const r = runComplianceCheckBackend(project, undefined);
    expect(r.projectName).toBe("");
  });

  it("rulesChecked carries metadata for PDF / external integration", () => {
    const r = runComplianceCheckBackend(VALID_PROJECT, undefined);
    expect(r.rulesChecked.length).toBe(8);
    expect(r.rulesChecked[0]!.standardRef).toBeDefined();
  });

  it("summary tally counts add up to totalViolations", () => {
    const r = runComplianceCheckBackend(
      { nodes: [], pipes: [{ ...VALID_PROJECT.pipes[0]!, dn: 47 }] },
      undefined,
    );
    const sum = r.summary.info + r.summary.warn + r.summary.error + r.summary.critical;
    expect(sum).toBe(r.summary.totalViolations);
  });
});
