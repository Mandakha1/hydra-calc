/**
 * Phase 13.25 — Classify pipes as MAGISTRAL or BRANCH from topology.
 *
 * Engineer report: "Манай систем тооцоо хийхдээ магистрал шугамыг
 * хэрхэн мэдэж байгаа вэ? Мөн магистрал шугам болон салбар шугамыг
 * шалгаж мэдэж чадах уу? Хэрэв чадахгүй бол... төв болон магистрал
 * шугамыг зураг болон тооцоон дээр ялгаж харуулна уу."
 *
 * Russian standards backing the classification (СНиП 41-02-2003 §1):
 *
 *   - **Магистральные тепловые сети** — трубопроводы, транспортирующие
 *     теплоноситель от источника тепла до точек присоединения
 *     ответвлений (trunk lines from source to first major branching).
 *   - **Распределительные тепловые сети** — распределяющие теплоту от
 *     магистральных сетей до тепловых пунктов потребителей (distribute
 *     to consumer-cluster УДДТ entries).
 *   - **Квартальные / салбар тепловые сети** — подающие теплоту к
 *     зданиям внутри квартала (last-mile, single consumer).
 *
 * Mongolian engineer convention (per attached диплом-шинэ.docx +
 * ЗАПИСКИ.docx examples + БНбД 41-02-13):
 *
 *   - Магистраль  — source → УДДТ (trunk feeder)
 *   - Салбар      — УДДТ → consumer, or УДДТ → УДДТ secondary
 *
 * Classification algorithm (pure topology, no flow / DN required):
 *
 *   For each pipe P with endpoints (A, B), count the number of CONSUMER
 *   nodes reachable in the to-node's subtree when P is removed from the
 *   graph (i.e. the consumer set fed THROUGH this pipe). If ≥ 2, P is a
 *   MAGISTRAL (trunk serving multiple consumers). If 1, P is a BRANCH
 *   (last-mile service). If 0, P is ORPHAN (dead-end — likely an error
 *   the engineer should fix).
 *
 *   For looped networks the algorithm picks the SHORTEST path from
 *   source via BFS so each consumer is counted exactly once. The
 *   classification doesn't depend on solver results — it's a pre-solve
 *   topology pass that the renderer / Excel exporter can call cheaply.
 *
 * Output:
 *   Map<pipeId, "magistral" | "branch" | "orphan">
 *
 * Complexity: O(P × N) — fine for typical district networks (< 1000 pipes).
 */

import type { SchemeNode, SchemePipe } from "../hydraulicTypes";
import { getNodeKind } from "../nodeCatalog";

export type PipeRole = "magistral" | "branch" | "orphan";

interface Graph {
  /** Adjacency: node id → list of { pipeId, otherEnd, isFromNode } */
  adj: Map<string, Array<{ pipeId: string; otherEnd: string }>>;
  /** Quick lookup: pipe id → endpoint pair (from, to) */
  pipeEndpoints: Map<string, { from: string; to: string }>;
}

function buildGraph(pipes: ReadonlyArray<SchemePipe>): Graph {
  const adj = new Map<string, Array<{ pipeId: string; otherEnd: string }>>();
  const pipeEndpoints = new Map<string, { from: string; to: string }>();
  for (const p of pipes) {
    if (p.channelId) continue; // skip channel-grouped pipes (Phase 12.5)
    pipeEndpoints.set(p.id, { from: p.fromNodeId, to: p.toNodeId });
    if (!adj.has(p.fromNodeId)) adj.set(p.fromNodeId, []);
    if (!adj.has(p.toNodeId)) adj.set(p.toNodeId, []);
    adj.get(p.fromNodeId)!.push({ pipeId: p.id, otherEnd: p.toNodeId });
    adj.get(p.toNodeId)!.push({ pipeId: p.id, otherEnd: p.fromNodeId });
  }
  return { adj, pipeEndpoints };
}

function isConsumer(node: SchemeNode | undefined): boolean {
  if (!node) return false;
  const def = getNodeKind(node.kind);
  return def?.category === "consumer";
}

function isSource(node: SchemeNode | undefined): boolean {
  if (!node) return false;
  const def = getNodeKind(node.kind);
  return def?.category === "source";
}

/**
 * BFS reach from a starting node with one pipe excluded. Returns the
 * set of visited nodes — caller derives consumer count + source
 * presence from the visited set. Visited covers the starting node.
 */
function bfsReach(
  startNodeId: string,
  excludePipeId: string,
  graph: Graph,
): Set<string> {
  const visited = new Set<string>([startNodeId]);
  const queue: string[] = [startNodeId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    const neighbours = graph.adj.get(current) ?? [];
    for (const n of neighbours) {
      if (n.pipeId === excludePipeId) continue;
      if (visited.has(n.otherEnd)) continue;
      visited.add(n.otherEnd);
      queue.push(n.otherEnd);
    }
  }
  return visited;
}

function countConsumersIn(
  nodeIds: Set<string>,
  nodesById: Map<string, SchemeNode>,
): number {
  let n = 0;
  for (const id of nodeIds) {
    if (isConsumer(nodesById.get(id))) n += 1;
  }
  return n;
}

function hasSourceIn(
  nodeIds: Set<string>,
  nodesById: Map<string, SchemeNode>,
): boolean {
  for (const id of nodeIds) {
    if (isSource(nodesById.get(id))) return true;
  }
  return false;
}

/**
 * Classify every pipe in the network as magistral / branch / orphan.
 *
 * Returns a Map keyed by pipe id. Pipes with `channelId` (inside a
 * Phase 12.5 composite channel trench) are excluded — the channel
 * carries the magistral / branch role at the trench level, not per-
 * pipe.
 */
export function classifyPipeRoles(
  pipes: ReadonlyArray<SchemePipe>,
  nodes: ReadonlyArray<SchemeNode>,
): Map<string, PipeRole> {
  const nodesById = new Map(nodes.map((n) => [n.id, n] as const));
  const graph = buildGraph(pipes);
  const out = new Map<string, PipeRole>();
  for (const p of pipes) {
    if (p.channelId) continue;
    // Reach both sides of the pipe (excluding the pipe itself) so we
    // can tell which side hosts the source(s) and which side hosts
    // the downstream consumers.
    const sideA = bfsReach(p.fromNodeId, p.id, graph);
    const sideB = bfsReach(p.toNodeId, p.id, graph);
    const consumersA = countConsumersIn(sideA, nodesById);
    const consumersB = countConsumersIn(sideB, nodesById);
    const sourceA = hasSourceIn(sideA, nodesById);
    const sourceB = hasSourceIn(sideB, nodesById);
    // Pick the DOWNSTREAM side: the one NOT containing a source.
    // When neither side has a source → orphan branch (engineer error).
    // When both have sources (rare ring with multiple sources), pick
    // the side with fewer sources / more consumers (most engineering
    // diagrams use single-source so this rarely fires).
    let downstreamConsumers: number;
    if (sourceA && !sourceB) {
      downstreamConsumers = consumersB;
    } else if (sourceB && !sourceA) {
      downstreamConsumers = consumersA;
    } else if (!sourceA && !sourceB) {
      // No source reachable — neither side feeds anything. Mark
      // orphan so engineer notices the disconnected network.
      out.set(p.id, "orphan");
      continue;
    } else {
      // Both sides have sources. This is the common Mongolian topology
      // where the main source feeds a УДДТ which then redistributes
      // to consumers (ТЭЦ → УДДТ → АОС × N). The "downstream" side
      // here is the one with MORE consumers — the source side hosting
      // the actual heat load. Min would mark such trunks as orphan
      // incorrectly.
      downstreamConsumers = Math.max(consumersA, consumersB);
    }
    if (downstreamConsumers === 0) {
      out.set(p.id, "orphan");
    } else if (downstreamConsumers >= 2) {
      out.set(p.id, "magistral");
    } else {
      out.set(p.id, "branch");
    }
  }
  return out;
}

/** Engineer-facing Mongolian label for a pipe role. */
export function pipeRoleLabel(role: PipeRole): string {
  switch (role) {
    case "magistral":
      return "Магистраль";
    case "branch":
      return "Салбар";
    case "orphan":
      return "Холбоогүй";
  }
}

/** Single-letter badge for in-canvas labelling. */
export function pipeRoleBadge(role: PipeRole): string {
  switch (role) {
    case "magistral":
      return "М";
    case "branch":
      return "С";
    case "orphan":
      return "?";
  }
}
