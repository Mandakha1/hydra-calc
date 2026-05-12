/**
 * Hardy-Cross loop solver for closed (looped) heat networks.
 *
 * For each loop, iteratively adjust flows so that ΣΔP around the loop = 0.
 *
 *   ΔQ = − ΣΔP / Σ|2·k·Q|
 *
 * where k is the pipe resistance constant (ΔP = k·Q²) and Q is signed flow.
 *
 * Tree networks need no iteration — this kicks in only when the topology has loops.
 */
import { PIPE_DB, PIPE_MATERIALS, WATER_PROPS } from "shared";
import { colebrookLambda } from "./hydraulics";
import type { ProjectSettings, SchemeNode, SchemePipe } from "../hydraulicTypes";

export interface LoopSolverResult {
  /** Pipe id → final flow (kg/s). Sign indicates direction relative to pipe.fromNodeId. */
  flows: Map<string, number>;
  iterations: number;
  /** Maximum residual ΣΔP across any loop (Pa) at final iteration. */
  maxResidual_pa: number;
  /** Detected loops (each as ordered list of pipe ids with sign +1 / -1). */
  loops: { pipeId: string; direction: 1 | -1 }[][];
  converged: boolean;
}

/** Detect cycles via DFS — returns minimal independent loop set. */
export function detectLoops(
  nodes: SchemeNode[],
  pipes: SchemePipe[],
): { pipeId: string; direction: 1 | -1 }[][] {
  // Build undirected adjacency
  const adj = new Map<string, { neighbor: string; pipe: SchemePipe; direction: 1 | -1 }[]>();
  for (const n of nodes) adj.set(n.id, []);
  for (const p of pipes) {
    adj.get(p.fromNodeId)?.push({ neighbor: p.toNodeId, pipe: p, direction: 1 });
    adj.get(p.toNodeId)?.push({ neighbor: p.fromNodeId, pipe: p, direction: -1 });
  }

  // Spanning tree via BFS from arbitrary root
  const root = nodes[0]?.id;
  if (!root) return [];
  const parent = new Map<string, { node: string; pipeId: string; direction: 1 | -1 }>();
  const visited = new Set<string>([root]);
  const queue = [root];
  while (queue.length > 0) {
    const u = queue.shift()!;
    for (const edge of adj.get(u) ?? []) {
      if (!visited.has(edge.neighbor)) {
        visited.add(edge.neighbor);
        parent.set(edge.neighbor, { node: u, pipeId: edge.pipe.id, direction: edge.direction });
        queue.push(edge.neighbor);
      }
    }
  }

  // For every non-tree edge, the cycle is its endpoints' path-to-LCA + the edge.
  const treeEdges = new Set<string>();
  for (const [, p] of parent) treeEdges.add(p.pipeId);

  const loops: { pipeId: string; direction: 1 | -1 }[][] = [];
  for (const pipe of pipes) {
    if (treeEdges.has(pipe.id)) continue;
    // Build cycle: from -> to via tree path + this edge.
    const path = pathInTree(parent, pipe.fromNodeId, pipe.toNodeId);
    if (!path) continue;
    const loop: { pipeId: string; direction: 1 | -1 }[] = path;
    loop.push({ pipeId: pipe.id, direction: -1 }); // closing edge in reverse
    loops.push(loop);
  }
  return loops;
}

function pathInTree(
  parent: Map<string, { node: string; pipeId: string; direction: 1 | -1 }>,
  a: string,
  b: string,
): { pipeId: string; direction: 1 | -1 }[] | null {
  const ancestors = new Map<string, { pipeId: string; direction: 1 | -1 }>();
  let cur: string | undefined = a;
  while (cur) {
    const par = parent.get(cur);
    if (!par) break;
    ancestors.set(par.node, { pipeId: par.pipeId, direction: par.direction });
    cur = par.node;
  }
  // Walk from b up; first hit in ancestors is LCA.
  const upFromB: { node: string; pipeId: string; direction: 1 | -1 }[] = [];
  cur = b;
  while (cur) {
    if (ancestors.has(cur)) {
      // Build forward path: from a up to LCA, reverse, then down to b
      const forward: { pipeId: string; direction: 1 | -1 }[] = [];
      let walk = a;
      while (walk !== cur) {
        const par = parent.get(walk);
        if (!par) return null;
        forward.push({ pipeId: par.pipeId, direction: par.direction });
        walk = par.node;
      }
      // Reverse downward portion
      for (let i = upFromB.length - 1; i >= 0; i -= 1) {
        const e = upFromB[i]!;
        forward.push({ pipeId: e.pipeId, direction: -e.direction as 1 | -1 });
      }
      return forward;
    }
    const par = parent.get(cur);
    if (!par) break;
    upFromB.push({ node: par.node, pipeId: par.pipeId, direction: par.direction });
    cur = par.node;
  }
  return null;
}

function pipeResistance_k(
  pipe: SchemePipe,
  settings: ProjectSettings,
  G_kg_s: number,
): number {
  const size = PIPE_DB[settings.primaryMaterialCategory].find((p) => p.dn === pipe.dn);
  if (!size) return 1;
  const d_m = size.id_mm / 1000;
  const area = (Math.PI * d_m * d_m) / 4;
  const rho = WATER_PROPS.density_kg_m3.at_80c;
  const v = Math.abs(G_kg_s) / (rho * area);
  const nu = WATER_PROPS.kinematic_viscosity_m2_s.at_80c;
  const Re = (v * d_m) / nu;
  const k_mm = pipe.roughness_mm ?? PIPE_MATERIALS.find((m) => m.key === pipe.materialKey)?.roughness_mm ?? 0.5;
  const { lambda } = colebrookLambda(Math.max(Re, 1), k_mm / size.id_mm);
  // ΔP = λ · L/d · ρv²/2 = λ · L/d · (G/ρA)² · ρ/2 = λ·L·G² / (2·d·ρ·A²)
  return (lambda * pipe.length_m) / (2 * d_m * rho * area * area);
}

export function hardyCross(
  nodes: SchemeNode[],
  pipes: SchemePipe[],
  initialFlows: Map<string, number>,
  settings: ProjectSettings,
  maxIter = 30,
  tol_pa = 100,
): LoopSolverResult {
  const loops = detectLoops(nodes, pipes);
  const flows = new Map(initialFlows);

  let maxResidual = Infinity;
  let iter = 0;
  let converged = false;

  for (iter = 0; iter < maxIter && !converged; iter += 1) {
    converged = true;
    maxResidual = 0;

    for (const loop of loops) {
      let sigmaDp = 0;
      let sigmaDeriv = 0;
      for (const edge of loop) {
        const pipe = pipes.find((p) => p.id === edge.pipeId);
        if (!pipe) continue;
        const Q = (flows.get(pipe.id) ?? 0.001) * edge.direction;
        const k = pipeResistance_k(pipe, settings, Q);
        sigmaDp += k * Q * Math.abs(Q);
        sigmaDeriv += 2 * k * Math.abs(Q);
      }
      const dQ = sigmaDeriv > 1e-9 ? -sigmaDp / sigmaDeriv : 0;
      maxResidual = Math.max(maxResidual, Math.abs(sigmaDp));
      if (Math.abs(sigmaDp) > tol_pa) {
        converged = false;
        for (const edge of loop) {
          const pipe = pipes.find((p) => p.id === edge.pipeId);
          if (!pipe) continue;
          flows.set(pipe.id, (flows.get(pipe.id) ?? 0) + dQ * edge.direction);
        }
      }
    }
  }

  return { flows, iterations: iter, maxResidual_pa: maxResidual, loops, converged };
}

export function hasLoops(nodes: SchemeNode[], pipes: SchemePipe[]): boolean {
  return detectLoops(nodes, pipes).length > 0;
}
