/**
 * Phase 8.3 — pure helper tests for the well / chamber detail view.
 */
import { describe, it, expect } from "vitest";
import {
  buildWellDetail,
  DEFAULT_WELL_DIMS,
  isWellLikeKind,
  penetrationSideOf,
  pickWell,
  sideLabel,
  type WellDetail,
} from "../wellDetail";
import type { SchemeNode, SchemePipe } from "../../hydraulicTypes";

function n(id: string, kind: string, x = 0, y = 0, extras: Partial<SchemeNode> = {}): SchemeNode {
  return { id, kind, label: id, x, y, ...extras };
}

function pipe(id: string, from: string, to: string, dn = 100, circuit?: string): SchemePipe {
  return {
    id, fromNodeId: from, toNodeId: to,
    materialKey: "steel_aged", dn, length_m: 50,
    ...(circuit ? { circuit: circuit as SchemePipe["circuit"] } : {}),
  };
}

/* ─── isWellLikeKind ───────────────────────────────────────── */

describe("isWellLikeKind — chamber category detection", () => {
  it("returns true for chamber-category kinds", () => {
    expect(isWellLikeKind("chamber")).toBe(true);
    expect(isWellLikeKind("well_supply")).toBe(true);
    expect(isWellLikeKind("well_drain")).toBe(true);
    expect(isWellLikeKind("expansion_tank")).toBe(true);
  });

  it("returns false for non-chamber kinds", () => {
    expect(isWellLikeKind("source_substation")).toBe(false);
    expect(isWellLikeKind("consumer_apartment")).toBe(false);
    expect(isWellLikeKind("pump_circ")).toBe(false);
    expect(isWellLikeKind("unknown")).toBe(false);
  });
});

/* ─── pickWell ─────────────────────────────────────────────── */

describe("pickWell — selection → fallback → null", () => {
  it("picks the selected node when it's a well kind", () => {
    const nodes = [n("a", "chamber"), n("b", "well_supply")];
    expect(pickWell(nodes, { kind: "node", id: "b" })?.id).toBe("b");
  });

  it("falls back to first chamber node when selection isn't a well", () => {
    const nodes = [n("c", "consumer_apartment"), n("w", "chamber")];
    expect(pickWell(nodes, { kind: "node", id: "c" })?.id).toBe("w");
  });

  it("returns null when no chamber nodes exist", () => {
    expect(pickWell([n("c", "consumer_apartment")], null)).toBeNull();
  });
});

/* ─── penetrationSideOf ────────────────────────────────────── */

describe("penetrationSideOf — angle to side mapping", () => {
  const well = n("w", "chamber", 100, 100);
  it("right when dx >= |dy| and positive", () => {
    expect(penetrationSideOf(well, n("a", "x", 200, 100))).toBe("right");
    expect(penetrationSideOf(well, n("a", "x", 200, 120))).toBe("right");
  });
  it("left when dx <= -|dy|", () => {
    expect(penetrationSideOf(well, n("a", "x", 0, 100))).toBe("left");
  });
  it("bottom when dy dominates positive", () => {
    expect(penetrationSideOf(well, n("a", "x", 110, 200))).toBe("bottom");
  });
  it("top when dy dominates negative", () => {
    expect(penetrationSideOf(well, n("a", "x", 110, 0))).toBe("top");
  });
});

/* ─── buildWellDetail ──────────────────────────────────────── */

describe("buildWellDetail — error + happy path", () => {
  it("returns error when no chamber node exists", () => {
    const r = buildWellDetail([n("c", "consumer_apartment")], [], null);
    expect("error" in r).toBe(true);
  });

  it("uses DEFAULT_WELL_DIMS when the chamber carries no dimensions", () => {
    const nodes = [n("w", "chamber")];
    const r = buildWellDetail(nodes, [], { kind: "node", id: "w" }) as WellDetail;
    expect(r.length_m).toBe(DEFAULT_WELL_DIMS.length_m);
    expect(r.width_m).toBe(DEFAULT_WELL_DIMS.width_m);
    expect(r.depth_m).toBe(DEFAULT_WELL_DIMS.depth_m);
    expect(r.coverDiameter_mm).toBe(DEFAULT_WELL_DIMS.coverDiameter_mm);
    expect(r.hasExplicitDimensions).toBe(false);
  });

  it("prefers explicit dimensions when stored on the node", () => {
    const nodes = [n("w", "chamber", 0, 0, {
      chamber_length_m: 4,
      chamber_width_m: 2.5,
      chamber_depth_m: 3,
      coverDiameter_mm: 800,
    })];
    const r = buildWellDetail(nodes, [], { kind: "node", id: "w" }) as WellDetail;
    expect(r.length_m).toBe(4);
    expect(r.width_m).toBe(2.5);
    expect(r.depth_m).toBe(3);
    expect(r.coverDiameter_mm).toBe(800);
    expect(r.hasExplicitDimensions).toBe(true);
  });

  it("collects all pipes touching the well + assigns each to a side", () => {
    const nodes = [
      n("w", "chamber", 100, 100),
      n("east", "junction", 200, 100),
      n("west", "junction", 0, 100),
      n("north", "junction", 100, 0),
      n("south", "junction", 100, 200),
    ];
    const pipes = [
      pipe("p1", "w", "east", 100, "heating_supply"),
      pipe("p2", "w", "west", 80, "heating_return"),
      pipe("p3", "north", "w", 50),
      pipe("p4", "south", "w", 50),
    ];
    const r = buildWellDetail(nodes, pipes, { kind: "node", id: "w" }) as WellDetail;
    expect(r.penetrations).toHaveLength(4);
    const bySide = Object.fromEntries(r.penetrations.map((p) => [p.side, p.pipeId]));
    expect(bySide.right).toBe("p1");
    expect(bySide.left).toBe("p2");
    expect(bySide.top).toBe("p3");
    expect(bySide.bottom).toBe("p4");
  });

  it("sorts penetrations by side then DN descending", () => {
    const nodes = [
      n("w", "chamber", 100, 100),
      n("a", "junction", 200, 100),
      n("b", "junction", 210, 105),
      n("c", "junction", 200, 95),
    ];
    const pipes = [
      pipe("p_small", "w", "a", 50),
      pipe("p_big", "w", "b", 150),
      pipe("p_mid", "w", "c", 100),
    ];
    const r = buildWellDetail(nodes, pipes, { kind: "node", id: "w" }) as WellDetail;
    // All on the right side. DN order: 150, 100, 50.
    expect(r.penetrations.map((p) => p.dn_mm)).toEqual([150, 100, 50]);
  });

  it("ignores pipes that don't touch the well", () => {
    const nodes = [n("w", "chamber"), n("a", "junction"), n("b", "junction")];
    const pipes = [pipe("p1", "a", "b", 50)];
    const r = buildWellDetail(nodes, pipes, { kind: "node", id: "w" }) as WellDetail;
    expect(r.penetrations).toHaveLength(0);
  });
});

/* ─── Side labels ──────────────────────────────────────────── */

describe("sideLabel — Mongolian engineer-friendly labels", () => {
  it("returns engineer-readable Mongolian directions", () => {
    expect(sideLabel("top")).toBe("Дээд");
    expect(sideLabel("right")).toBe("Баруун");
    expect(sideLabel("bottom")).toBe("Доод");
    expect(sideLabel("left")).toBe("Зүүн");
  });
});
