/**
 * Phase 13.25 — Magistral / branch classification tests.
 *
 * Engineer's question: "Манай систем магистрал шугам болон салбар
 * шугамыг шалгаж мэдэж чадах уу?" — Russian / Mongolian district-
 * heating standards distinguish trunk feeders (magistral) from
 * last-mile service (salbar / branch). The helper computes this
 * from network topology alone (no flow / DN required).
 */
import { describe, it, expect } from "vitest";
import {
  classifyPipeRoles,
  pipeRoleLabel,
  pipeRoleBadge,
} from "../classifyPipeRoles";
import type { SchemeNode, SchemePipe } from "../../hydraulicTypes";

function source(id: string): SchemeNode {
  return { id, kind: "source_substation", label: id, x: 0, y: 0 };
}
function consumer(id: string): SchemeNode {
  return { id, kind: "consumer_apartment", label: id, x: 0, y: 0 };
}
function junction(id: string): SchemeNode {
  return { id, kind: "junction", label: id, x: 0, y: 0 };
}
function pipe(id: string, from: string, to: string, channelId?: string): SchemePipe {
  return {
    id,
    fromNodeId: from,
    toNodeId: to,
    materialKey: "steel_aged",
    dn: 50,
    length_m: 10,
    circuit: "heating_supply",
    ...(channelId ? { channelId } : {}),
  };
}

describe("classifyPipeRoles — Phase 13.25", () => {
  it("single source → single consumer (straight pipe) → BRANCH", () => {
    // S → C (1 consumer downstream of the pipe → салбар)
    const nodes = [source("s"), consumer("c")];
    const pipes = [pipe("p1", "s", "c")];
    const roles = classifyPipeRoles(pipes, nodes);
    expect(roles.get("p1")).toBe("branch");
  });

  it("source → junction → 2 consumers: trunk pipe = MAGISTRAL, each leg = BRANCH", () => {
    // S → J → C1
    //     ↘ C2
    // Pipe S→J feeds 2 consumers (magistral). J→C1, J→C2 each feeds 1 (branch).
    const nodes = [source("s"), junction("j"), consumer("c1"), consumer("c2")];
    const pipes = [
      pipe("trunk", "s", "j"),
      pipe("leg1", "j", "c1"),
      pipe("leg2", "j", "c2"),
    ];
    const roles = classifyPipeRoles(pipes, nodes);
    expect(roles.get("trunk")).toBe("magistral");
    expect(roles.get("leg1")).toBe("branch");
    expect(roles.get("leg2")).toBe("branch");
  });

  it("orphan pipe (junction → empty) → ORPHAN classification", () => {
    // S → J — nothing else. The pipe S→J has 0 consumers downstream.
    const nodes = [source("s"), junction("j")];
    const pipes = [pipe("p1", "s", "j")];
    const roles = classifyPipeRoles(pipes, nodes);
    expect(roles.get("p1")).toBe("orphan");
  });

  it("3-level tree: trunk → distribution → service", () => {
    // S → J1 → J2 → C1
    //         ↘ C2
    //   J1 → J3 → C3
    //
    //   S→J1   : feeds {C1, C2, C3} = magistral
    //   J1→J2  : feeds {C1, C2}     = magistral (still ≥ 2)
    //   J1→J3  : feeds {C3}         = branch
    //   J2→C1  : feeds {C1}         = branch
    //   J2→C2  : feeds {C2}         = branch
    //   J3→C3  : feeds {C3}         = branch
    const nodes = [
      source("s"),
      junction("j1"),
      junction("j2"),
      junction("j3"),
      consumer("c1"),
      consumer("c2"),
      consumer("c3"),
    ];
    const pipes = [
      pipe("p_s_j1", "s", "j1"),
      pipe("p_j1_j2", "j1", "j2"),
      pipe("p_j1_j3", "j1", "j3"),
      pipe("p_j2_c1", "j2", "c1"),
      pipe("p_j2_c2", "j2", "c2"),
      pipe("p_j3_c3", "j3", "c3"),
    ];
    const roles = classifyPipeRoles(pipes, nodes);
    expect(roles.get("p_s_j1")).toBe("magistral");
    expect(roles.get("p_j1_j2")).toBe("magistral");
    expect(roles.get("p_j1_j3")).toBe("branch");
    expect(roles.get("p_j2_c1")).toBe("branch");
    expect(roles.get("p_j2_c2")).toBe("branch");
    expect(roles.get("p_j3_c3")).toBe("branch");
  });

  it("channel-bound pipes are excluded from classification (Phase 12.5 trench)", () => {
    // Pipes inside a SchemeChannel carry their role at the channel
    // level — individual constituents skipped.
    const nodes = [source("s"), consumer("c")];
    const pipes = [
      pipe("p_channel", "s", "c", "ch1"),
      pipe("p_standalone", "s", "c"),
    ];
    const roles = classifyPipeRoles(pipes, nodes);
    expect(roles.has("p_channel")).toBe(false);
    expect(roles.get("p_standalone")).toBe("branch");
  });

  it("ring loop (S — J1 — J2 — S): both pipes classified consistently", () => {
    // Cycle test: both pipes have 0 consumers reachable on either side
    // (ring of junctions / sources). Both classified as orphan since
    // there's no consumer load. Engineer should add at least one
    // consumer.
    const nodes = [source("s"), junction("j1"), junction("j2")];
    const pipes = [
      pipe("p1", "s", "j1"),
      pipe("p2", "j1", "j2"),
      pipe("p3", "j2", "s"),
    ];
    const roles = classifyPipeRoles(pipes, nodes);
    expect(roles.get("p1")).toBe("orphan");
    expect(roles.get("p2")).toBe("orphan");
    expect(roles.get("p3")).toBe("orphan");
  });

  it("ring with consumer attached: all pipes feed the consumer → branch", () => {
    // S — J1 — J2 — S, with C hanging off J2.
    // p_s_j1 → reachable C through J1→J2→C = 1 consumer → branch
    // p_j1_j2 → reachable C through J2→C = 1 → branch
    // p_j2_s → reachable C through J2 = 1 (C is direct) → branch
    // p_j2_c → reachable C = 1 → branch
    const nodes = [
      source("s"),
      junction("j1"),
      junction("j2"),
      consumer("c"),
    ];
    const pipes = [
      pipe("p_s_j1", "s", "j1"),
      pipe("p_j1_j2", "j1", "j2"),
      pipe("p_j2_s", "j2", "s"),
      pipe("p_j2_c", "j2", "c"),
    ];
    const roles = classifyPipeRoles(pipes, nodes);
    // All 4 pipes feed exactly 1 consumer along their downstream side
    // → all branch.
    for (const pid of ["p_s_j1", "p_j1_j2", "p_j2_s", "p_j2_c"]) {
      expect(roles.get(pid)).toBe("branch");
    }
  });

  it("engineer scenario from диплом: УДДТ → 3 buildings should mark УДДТ inflow as magistral", () => {
    // S(source_tec) → UDDT(source_substation) → AOC1, AOC2, AOC3
    //
    // Russian convention: pipes carrying multiple consumers worth of
    // load are magistral. The trunk into the УДДТ feeds 3 buildings.
    const nodes = [
      { id: "s", kind: "source_tec", label: "ЭҮ-1", x: 0, y: 0 } as SchemeNode,
      { id: "uddt", kind: "source_substation", label: "УДДТ-1", x: 100, y: 0 } as SchemeNode,
      consumer("a1"),
      consumer("a2"),
      consumer("a3"),
    ];
    const pipes = [
      pipe("trunk", "s", "uddt"),
      pipe("leg1", "uddt", "a1"),
      pipe("leg2", "uddt", "a2"),
      pipe("leg3", "uddt", "a3"),
    ];
    const roles = classifyPipeRoles(pipes, nodes);
    expect(roles.get("trunk")).toBe("magistral");
    expect(roles.get("leg1")).toBe("branch");
    expect(roles.get("leg2")).toBe("branch");
    expect(roles.get("leg3")).toBe("branch");
  });
});

describe("pipeRoleLabel / pipeRoleBadge — Phase 13.25", () => {
  it("Mongolian labels for each role", () => {
    expect(pipeRoleLabel("magistral")).toBe("Магистраль");
    expect(pipeRoleLabel("branch")).toBe("Салбар");
    expect(pipeRoleLabel("orphan")).toBe("Холбоогүй");
  });

  it("single-letter badges for in-canvas labelling", () => {
    expect(pipeRoleBadge("magistral")).toBe("М");
    expect(pipeRoleBadge("branch")).toBe("С");
    expect(pipeRoleBadge("orphan")).toBe("?");
  });
});
