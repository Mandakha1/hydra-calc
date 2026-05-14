/**
 * Phase 8.5 — pure helper tests for the P&ID layout.
 */
import { describe, it, expect } from "vitest";
import { buildPidLayout, roleOf, roleLabel, symbolFor, type PidLayout } from "../pid";
import type { SchemeNode, SchemePipe } from "../../hydraulicTypes";

function n(id: string, kind: string, label = id): SchemeNode {
  return { id, kind, label, x: 0, y: 0 };
}

function pipe(id: string, from: string, to: string, circuit?: string): SchemePipe {
  return {
    id, fromNodeId: from, toNodeId: to,
    materialKey: "steel_aged", dn: 100, length_m: 50,
    ...(circuit ? { circuit: circuit as SchemePipe["circuit"] } : {}),
  };
}

describe("roleOf — kind to P&ID role mapping", () => {
  it("classifies the 6 main roles", () => {
    expect(roleOf("source_substation")).toBe("source");
    expect(roleOf("pump_circ")).toBe("pump");
    expect(roleOf("valve_gate")).toBe("valve");
    expect(roleOf("sensor_pressure")).toBe("sensor");
    expect(roleOf("consumer_apartment")).toBe("consumer");
    expect(roleOf("chamber")).toBe("chamber");
    expect(roleOf("tee")).toBe("junction");
  });
});

describe("symbolFor — ISA/ГОСТ symbol code", () => {
  it("maps sensor kinds to P/T/F/MT letters", () => {
    expect(symbolFor("sensor_pressure")).toBe("P");
    expect(symbolFor("sensor_temperature")).toBe("T");
    expect(symbolFor("sensor_flow")).toBe("F");
    expect(symbolFor("sensor_multipoint")).toBe("MT");
  });

  it("maps source / pump / valve to engineer-meaningful tags", () => {
    expect(symbolFor("source_substation")).toBe("ЦТП");
    expect(symbolFor("pump_circ")).toBe("N");
    expect(symbolFor("valve_gate")).toBe("V");
    expect(symbolFor("consumer_apartment")).toBe("АОС");
  });
});

describe("buildPidLayout — error states", () => {
  it("empty network → error", () => {
    const r = buildPidLayout([], []);
    expect("error" in r).toBe(true);
  });

  it("no source → error", () => {
    const r = buildPidLayout([n("c", "consumer_apartment")], []);
    expect("error" in r).toBe(true);
    if ("error" in r) expect(r.error).toMatch(/Эх үүсвэр/);
  });
});

describe("buildPidLayout — BFS layout", () => {
  it("source at column 0, downstream consumers at column 1", () => {
    const nodes = [n("s", "source_substation"), n("c1", "consumer_apartment")];
    const pipes = [pipe("p1", "s", "c1", "heating_supply")];
    const r = buildPidLayout(nodes, pipes) as PidLayout;
    expect(r.elements.find((e) => e.nodeId === "s")!.column).toBe(0);
    expect(r.elements.find((e) => e.nodeId === "c1")!.column).toBe(1);
    expect(r.columns).toBe(2);
  });

  it("nested chain assigns column per BFS depth", () => {
    const nodes = [
      n("s", "source_substation"),
      n("p", "pump_circ"),
      n("v", "valve_gate"),
      n("c", "consumer_apartment"),
    ];
    const pipes = [
      pipe("p1", "s", "p"),
      pipe("p2", "p", "v"),
      pipe("p3", "v", "c"),
    ];
    const r = buildPidLayout(nodes, pipes) as PidLayout;
    expect(r.elements.find((e) => e.nodeId === "s")!.column).toBe(0);
    expect(r.elements.find((e) => e.nodeId === "p")!.column).toBe(1);
    expect(r.elements.find((e) => e.nodeId === "v")!.column).toBe(2);
    expect(r.elements.find((e) => e.nodeId === "c")!.column).toBe(3);
    expect(r.columns).toBe(4);
  });

  it("sensors get row = -1 (above trunk)", () => {
    const nodes = [
      n("s", "source_substation"),
      n("t", "sensor_temperature"),
    ];
    const pipes = [pipe("p1", "s", "t")];
    const r = buildPidLayout(nodes, pipes) as PidLayout;
    expect(r.elements.find((e) => e.nodeId === "t")!.row).toBe(-1);
    expect(r.elements.find((e) => e.nodeId === "s")!.row).toBe(0);
  });

  it("non-sensor nodes always at row 0", () => {
    const nodes = [
      n("s", "source_substation"),
      n("p", "pump_circ"),
      n("v", "valve_gate"),
      n("c", "consumer_apartment"),
    ];
    const pipes = [
      pipe("p1", "s", "p"),
      pipe("p2", "p", "v"),
      pipe("p3", "v", "c"),
    ];
    const r = buildPidLayout(nodes, pipes) as PidLayout;
    for (const e of r.elements) {
      if (e.role !== "sensor") expect(e.row).toBe(0);
    }
  });

  it("nodes disconnected from any source are skipped", () => {
    const nodes = [
      n("s", "source_substation"),
      n("orphan", "consumer_apartment"),
    ];
    const pipes: SchemePipe[] = [];
    const r = buildPidLayout(nodes, pipes) as PidLayout;
    expect(r.elements.find((e) => e.nodeId === "orphan")).toBeUndefined();
  });

  it("edges connect only placed elements", () => {
    const nodes = [
      n("s", "source_substation"),
      n("c", "consumer_apartment"),
    ];
    const pipes = [
      pipe("p1", "s", "c", "heating_supply"),
      pipe("p2", "s", "ghost"), // ghost not in nodes
    ];
    const r = buildPidLayout(nodes, pipes) as PidLayout;
    expect(r.edges).toHaveLength(1);
    expect(r.edges[0]!.fromId).toBe("s");
    expect(r.edges[0]!.toId).toBe("c");
    expect(r.edges[0]!.circuit).toBe("heating_supply");
  });
});

describe("roleLabel — Mongolian-friendly", () => {
  it("returns engineer-grade Mongolian labels", () => {
    expect(roleLabel("source")).toBe("Эх үүсвэр");
    expect(roleLabel("pump")).toBe("Насос");
    expect(roleLabel("valve")).toBe("Арматура");
    expect(roleLabel("sensor")).toBe("Мэдрэгч");
    expect(roleLabel("consumer")).toBe("Хэрэглэгч");
  });
});
