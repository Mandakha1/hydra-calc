/**
 * Network topology helpers — adjacency + pathfinding.
 *
 * The hydraulic scheme is a directed graph (every SchemePipe has
 * fromNodeId/toNodeId), but for flow analysis the underlying physical
 * pipes are bidirectional: water can move either way depending on
 * pump configuration. Loop-balance, longest-path and piezometric trace
 * all need undirected traversal.
 *
 * These helpers keep both views available so callers pick what they
 * need. They are intentionally **pure functions** — no I/O, no mutation
 * of inputs — so each one is unit-testable in isolation.
 *
 * Standard references:
 *   - СП 124.13330.2012 §7  (longest path = "магистрал" line, determines pump head)
 *   - BNbD 41-01-2019 §6.3  (consumer Δp ≥ 0.15 MPa rule applied to the farthest consumer)
 */
import type { SchemeNode, SchemePipe } from "../hydraulicTypes";

/** Pipe annotated with the direction in which it was traversed during a walk.
 *  `forward` = walked fromNodeId → toNodeId (matches the SchemePipe field
 *  order). `backward` = walked toNodeId → fromNodeId (the pipe was used in
 *  reverse, which the underlying physics happily allows). */
export interface OrientedPipe {
  pipe: SchemePipe;
  forward: boolean;
}

/** Directed adjacency: from `fromNodeId` → list of outgoing pipes only. */
export function buildDirectedAdjacency(pipes: SchemePipe[]): Map<string, SchemePipe[]> {
  const adj = new Map<string, SchemePipe[]>();
  for (const p of pipes) {
    if (!adj.has(p.fromNodeId)) adj.set(p.fromNodeId, []);
    adj.get(p.fromNodeId)!.push(p);
  }
  return adj;
}

/** Undirected adjacency: every pipe contributes to both endpoints' lists.
 *  Each entry carries the orientation flag so callers know whether the
 *  pipe is being read forward or backward (e.g. for length sign in a
 *  back-walk along the return circuit). */
export function buildUndirectedAdjacency(pipes: SchemePipe[]): Map<string, OrientedPipe[]> {
  const adj = new Map<string, OrientedPipe[]>();
  for (const p of pipes) {
    if (!adj.has(p.fromNodeId)) adj.set(p.fromNodeId, []);
    if (!adj.has(p.toNodeId)) adj.set(p.toNodeId, []);
    adj.get(p.fromNodeId)!.push({ pipe: p, forward: true });
    adj.get(p.toNodeId)!.push({ pipe: p, forward: false });
  }
  return adj;
}

export interface PathResult {
  /** Node IDs along the path, starting with the source. */
  nodeIds: string[];
  /** Pipes in traversal order (length = nodeIds.length − 1). */
  pipes: OrientedPipe[];
  /** Cumulative length in metres of all pipes on the path. */
  totalLengthM: number;
}

/**
 * Find the longest (cumulative-pipe-length) path from a source node to
 * any reachable terminal node in the undirected pipe graph. Uses DFS
 * with early-exit memoisation; safe for the few-hundred-node networks
 * Hydra Calc targets.
 *
 * "Longest path" by spec = the magistral line whose pressure drop sets
 * the required pump head. Per СП 124.13330 §7.4 we follow the longest
 * cumulative length from the source to the worst-served consumer.
 *
 * Returns `null` if the source isn't in the graph or has no pipes.
 */
export function findLongestPath(
  nodes: SchemeNode[],
  pipes: SchemePipe[],
  sourceId: string,
): PathResult | null {
  if (nodes.length === 0 || pipes.length === 0) return null;
  if (!nodes.some((n) => n.id === sourceId)) return null;
  const adj = buildUndirectedAdjacency(pipes);

  let best: PathResult | null = null;
  const visited = new Set<string>();

  function dfs(nodeId: string, pathNodes: string[], pathPipes: OrientedPipe[], cumLen: number): void {
    visited.add(nodeId);
    const out = adj.get(nodeId) ?? [];
    // Treat a node with no further unvisited neighbours as a path terminus.
    let isTerminal = true;
    for (const op of out) {
      const next = op.forward ? op.pipe.toNodeId : op.pipe.fromNodeId;
      if (visited.has(next)) continue;
      isTerminal = false;
      dfs(
        next,
        [...pathNodes, next],
        [...pathPipes, op],
        cumLen + op.pipe.length_m,
      );
    }
    if (isTerminal) {
      if (best === null || cumLen > best.totalLengthM) {
        best = { nodeIds: pathNodes, pipes: pathPipes, totalLengthM: cumLen };
      }
    }
    visited.delete(nodeId);
  }

  dfs(sourceId, [sourceId], [], 0);
  return best;
}

/**
 * Find a path (any path, BFS — i.e. fewest-hop) from `sourceId` to
 * `consumerId`. Returns the pipe sequence used; null if unreachable.
 *
 * BFS guarantees the shortest hop count, but the result is also the
 * canonical "magistral leg → branch tee → consumer" sequence in a
 * radial tree network — exactly what the piezometric profile needs
 * when the caller already knows which consumer to plot.
 */
export function pathToConsumer(
  nodes: SchemeNode[],
  pipes: SchemePipe[],
  sourceId: string,
  consumerId: string,
): PathResult | null {
  if (sourceId === consumerId) return { nodeIds: [sourceId], pipes: [], totalLengthM: 0 };
  if (!nodes.some((n) => n.id === sourceId) || !nodes.some((n) => n.id === consumerId)) return null;
  const adj = buildUndirectedAdjacency(pipes);

  // BFS — predecessor map records the pipe used to reach each node.
  const predecessor = new Map<string, { fromNode: string; via: OrientedPipe }>();
  const queue: string[] = [sourceId];
  const visited = new Set<string>([sourceId]);

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current === consumerId) break;
    for (const op of adj.get(current) ?? []) {
      const next = op.forward ? op.pipe.toNodeId : op.pipe.fromNodeId;
      if (visited.has(next)) continue;
      visited.add(next);
      predecessor.set(next, { fromNode: current, via: op });
      queue.push(next);
    }
  }
  if (!predecessor.has(consumerId) && consumerId !== sourceId) return null;

  // Reconstruct path back to source.
  const nodeIds: string[] = [];
  const pipesAlong: OrientedPipe[] = [];
  let cursor: string | undefined = consumerId;
  let totalLengthM = 0;
  while (cursor && cursor !== sourceId) {
    nodeIds.unshift(cursor);
    const step = predecessor.get(cursor);
    if (!step) return null;
    pipesAlong.unshift(step.via);
    totalLengthM += step.via.pipe.length_m;
    cursor = step.fromNode;
  }
  nodeIds.unshift(sourceId);

  return { nodeIds, pipes: pipesAlong, totalLengthM };
}

/**
 * Convenience: pick the "auto" source node — the first node whose `kind`
 * starts with `source_` (ТЭЦ, котельная, ЦТП, геотермал). Falls back to
 * the first node if none qualifies. Returns `null` only on empty graphs.
 */
export function pickAutoSource(nodes: SchemeNode[]): SchemeNode | null {
  if (nodes.length === 0) return null;
  return nodes.find((n) => n.kind?.startsWith("source_")) ?? nodes[0] ?? null;
}
