/**
 * Phase 9.3 — Geometric + project metadata rule tests.
 *
 * 10 new rules × 2 scenarios = 20 tests. Registry sanity check
 * confirms total = 30.
 */
import { describe, it, expect } from "vitest";
import { runComplianceCheck } from "../ruleEngine";
import { ALL_RULES } from "../rules";
import type {
  HydraulicState,
  SchemeNode,
  SchemePipe,
  SchemeBuilding,
} from "../../../hydraulicTypes";
import { emptyState } from "../../../hydraulicTypes";

function makeNode(over: Partial<SchemeNode> & { id: string; kind: string }): SchemeNode {
  return { label: over.id, x: 0, y: 0, ...over };
}
function makePipe(over: Partial<SchemePipe> & { id: string; fromNodeId: string; toNodeId: string }): SchemePipe {
  return { materialKey: "steel_aged", dn: 100, length_m: 30, circuit: "heating_supply", ...over };
}
function makeBuilding(over: Partial<SchemeBuilding> & { id: string }): SchemeBuilding {
  return { polygon: [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 50 }, { x: 0, y: 50 }], ...over };
}
function makeState(): HydraulicState {
  const s = emptyState();
  s.nodes = [
    makeNode({ id: "src", kind: "source_substation", label: "ЦТП" }),
    makeNode({ id: "aos1", kind: "consumer_apartment", label: "АОС-1" }),
  ];
  s.pipes = [makePipe({ id: "p1", fromNodeId: "src", toNodeId: "aos1" })];
  return s;
}
function violationsForRule(report: ReturnType<typeof runComplianceCheck>, ruleId: string) {
  return report.results.filter((r) => r.ruleId === ruleId);
}

/* ─── Registry sanity ──────────────────────────────────────────── */

describe("ALL_RULES registry — Phase 9.3", () => {
  it("contains 30 rules total (8 + 12 + 10)", () => {
    expect(ALL_RULES.length).toBe(30);
  });

  it("all rule ids still unique", () => {
    const ids = ALL_RULES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

/* ─── Rule 21 — fixed_support_spacing_max ─────────────────────── */

describe("Rule 21 — fixed_support_spacing_max", () => {
  it("PASS: pipe L=30m, no support → silently ok", () => {
    const s = makeState();
    const r = runComplianceCheck(s, undefined, ALL_RULES);
    expect(violationsForRule(r, "fixed_support_spacing_max")).toHaveLength(0);
  });

  it("FAIL: pipe L=70m, no support → WARN", () => {
    const s = makeState();
    s.pipes[0]!.length_m = 70;
    const r = runComplianceCheck(s, undefined, ALL_RULES);
    expect(violationsForRule(r, "fixed_support_spacing_max").length).toBeGreaterThanOrEqual(1);
  });
});

/* ─── Rule 22 — compensator_spacing_required ──────────────────── */

describe("Rule 22 — compensator_spacing_required", () => {
  it("PASS: pipe L=30m → no violation", () => {
    const s = makeState();
    const r = runComplianceCheck(s, undefined, ALL_RULES);
    expect(violationsForRule(r, "compensator_spacing_required")).toHaveLength(0);
  });

  it("FAIL: pipe L=120m, no compensator → ERROR", () => {
    const s = makeState();
    s.pipes[0]!.length_m = 120;
    const r = runComplianceCheck(s, undefined, ALL_RULES);
    const v = violationsForRule(r, "compensator_spacing_required");
    expect(v).toHaveLength(1);
    expect(v[0]!.severity).toBe("error");
  });
});

/* ─── Rule 23 — well_at_branches ──────────────────────────────── */

describe("Rule 23 — well_at_branches", () => {
  it("PASS: T-junction at well_supply node → no violation", () => {
    const s = makeState();
    s.nodes.push(
      makeNode({ id: "well", kind: "well_supply", label: "ҮХТ-1" }),
      makeNode({ id: "aos2", kind: "consumer_apartment", label: "АОС-2" }),
    );
    s.pipes = [
      makePipe({ id: "p1", fromNodeId: "src", toNodeId: "well" }),
      makePipe({ id: "p2", fromNodeId: "well", toNodeId: "aos1" }),
      makePipe({ id: "p3", fromNodeId: "well", toNodeId: "aos2" }),
    ];
    const r = runComplianceCheck(s, undefined, ALL_RULES);
    expect(violationsForRule(r, "well_at_branches")).toHaveLength(0);
  });

  it("FAIL: T-junction at junction node (no well) → WARN", () => {
    const s = makeState();
    s.nodes.push(
      makeNode({ id: "j", kind: "junction", label: "Т-1" }),
      makeNode({ id: "aos2", kind: "consumer_apartment", label: "АОС-2" }),
    );
    s.pipes = [
      makePipe({ id: "p1", fromNodeId: "src", toNodeId: "j" }),
      makePipe({ id: "p2", fromNodeId: "j", toNodeId: "aos1" }),
      makePipe({ id: "p3", fromNodeId: "j", toNodeId: "aos2" }),
    ];
    const r = runComplianceCheck(s, undefined, ALL_RULES);
    expect(violationsForRule(r, "well_at_branches")).toHaveLength(1);
  });
});

/* ─── Rule 24 — building_footprint_metadata ──────────────────── */

describe("Rule 24 — building_footprint_metadata", () => {
  it("PASS: building with floors + heatLoad_kw → no violation", () => {
    const s = makeState();
    s.buildings = [makeBuilding({ id: "b1", label: "Б-1", floors: 5, heatLoad_kw: 200 })];
    const r = runComplianceCheck(s, undefined, ALL_RULES);
    expect(violationsForRule(r, "building_footprint_metadata")).toHaveLength(0);
  });

  it("FAIL: building missing both → INFO", () => {
    const s = makeState();
    s.buildings = [makeBuilding({ id: "b1", label: "Б-1" })];
    const r = runComplianceCheck(s, undefined, ALL_RULES);
    expect(violationsForRule(r, "building_footprint_metadata")).toHaveLength(1);
  });
});

/* ─── Rule 25 — consumer_distance_to_source_max ──────────────── */

describe("Rule 25 — consumer_distance_to_source_max", () => {
  it("PASS: short network → no violation", () => {
    const s = makeState();
    const r = runComplianceCheck(s, undefined, ALL_RULES);
    expect(violationsForRule(r, "consumer_distance_to_source_max")).toHaveLength(0);
  });

  it("FAIL: 1500m of pipes → INFO", () => {
    const s = makeState();
    s.pipes[0]!.length_m = 1500;
    const r = runComplianceCheck(s, undefined, ALL_RULES);
    const v = violationsForRule(r, "consumer_distance_to_source_max");
    expect(v).toHaveLength(1);
  });
});

/* ─── Rule 26 — pipe_overlap ─────────────────────────────────── */

describe("Rule 26 — pipe_overlap", () => {
  it("PASS: single pipe → no violation", () => {
    const s = makeState();
    const r = runComplianceCheck(s, undefined, ALL_RULES);
    expect(violationsForRule(r, "pipe_overlap")).toHaveLength(0);
  });

  it("FAIL: duplicate pipe (same endpoints) → ERROR", () => {
    const s = makeState();
    s.pipes.push(makePipe({ id: "p2", fromNodeId: "src", toNodeId: "aos1" })); // duplicate
    const r = runComplianceCheck(s, undefined, ALL_RULES);
    expect(violationsForRule(r, "pipe_overlap")).toHaveLength(1);
  });
});

/* ─── Rule 27 — dimension_orphan ─────────────────────────────── */

describe("Rule 27 — dimension_orphan", () => {
  it("PASS: dimension with valid anchors → no violation", () => {
    const s = makeState();
    s.dimensions = [{ id: "d1", fromNodeId: "src", toNodeId: "aos1", offset_px: 30 }];
    const r = runComplianceCheck(s, undefined, ALL_RULES);
    expect(violationsForRule(r, "dimension_orphan")).toHaveLength(0);
  });

  it("FAIL: dimension referencing deleted node → INFO", () => {
    const s = makeState();
    s.dimensions = [{ id: "d1", fromNodeId: "src", toNodeId: "ghost", offset_px: 30 }];
    const r = runComplianceCheck(s, undefined, ALL_RULES);
    expect(violationsForRule(r, "dimension_orphan")).toHaveLength(1);
  });
});

/* ─── Rule 28 — project_metadata_complete ────────────────────── */

describe("Rule 28 — project_metadata_complete", () => {
  it("PASS: title block fully filled → no violation", () => {
    const s = makeState();
    s.settings.titleBlock = {
      engineer: "Болд",
      checker: "Сүх",
      company: "Гэрлэлт ХХК",
    };
    const r = runComplianceCheck(s, undefined, ALL_RULES);
    expect(violationsForRule(r, "project_metadata_complete")).toHaveLength(0);
  });

  it("FAIL: title block missing → WARN", () => {
    const s = makeState();
    const r = runComplianceCheck(s, undefined, ALL_RULES);
    expect(violationsForRule(r, "project_metadata_complete")).toHaveLength(1);
  });
});

/* ─── Rule 29 — project_scale_set ────────────────────────────── */

describe("Rule 29 — project_scale_set", () => {
  it("PASS: scale 1:500 → no violation", () => {
    const s = makeState();
    s.settings.printScale = "1:500";
    const r = runComplianceCheck(s, undefined, ALL_RULES);
    expect(violationsForRule(r, "project_scale_set")).toHaveLength(0);
  });

  it("FAIL: scale unset → INFO", () => {
    const s = makeState();
    const r = runComplianceCheck(s, undefined, ALL_RULES);
    expect(violationsForRule(r, "project_scale_set")).toHaveLength(1);
  });
});

/* ─── Rule 30 — project_paper_set ────────────────────────────── */

describe("Rule 30 — project_paper_set", () => {
  it("PASS: A3 + landscape → no violation", () => {
    const s = makeState();
    s.settings.printPaperSize = "A3";
    s.settings.printOrientation = "landscape";
    const r = runComplianceCheck(s, undefined, ALL_RULES);
    expect(violationsForRule(r, "project_paper_set")).toHaveLength(0);
  });

  it("FAIL: neither set → INFO", () => {
    const s = makeState();
    const r = runComplianceCheck(s, undefined, ALL_RULES);
    expect(violationsForRule(r, "project_paper_set")).toHaveLength(1);
  });
});
