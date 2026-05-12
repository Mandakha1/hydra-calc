/**
 * Zulu-style "write-back": after running computation, mutate the SchemeNode + SchemePipe
 * objects in-place with `result_*` fields so Inspector + Excel + Save all see live values
 * the same way Zulu does (it stores results back into _kamera, _ctp, _uzvvod, _uch tables).
 */
import type {
  CalculationResults,
  SchemeNode,
  SchemePipe,
  ProjectSettings,
} from "../hydraulicTypes";
import { TEMP_SCHEDULES, WATER_PROPS, PIPE_DB } from "shared";

const GRAVITY = 9.81;
const C_P = WATER_PROPS.specific_heat_j_kg_k;

function waterDensityAt(t_c: number): number {
  const map = WATER_PROPS.density_kg_m3;
  const rounded = Math.round(t_c / 5) * 5;
  const key = `at_${rounded}c` as keyof typeof map;
  return map[key] ?? 970;
}

/** Mutate `nodes` and `pipes` in place with computed result_* fields. */
export function writeBackResults(
  nodes: SchemeNode[],
  pipes: SchemePipe[],
  results: CalculationResults,
  settings: ProjectSettings,
): void {
  const schedule = TEMP_SCHEDULES.find((t) => t.key === settings.temperatureScheduleKey) ?? TEMP_SCHEDULES[0]!;
  const t_mean = (schedule.supply_c + schedule.return_c) / 2;
  const rho = waterDensityAt(t_mean);

  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  // Cumulative distance from source (BFS)
  const sourceId = nodes.find((n) => n.kind === "source" || n.kind?.startsWith("source_"))?.id ?? nodes[0]?.id;
  const dist = new Map<string, number>();
  const adj = new Map<string, SchemePipe[]>();
  for (const p of pipes) {
    if (!adj.has(p.fromNodeId)) adj.set(p.fromNodeId, []);
    adj.get(p.fromNodeId)!.push(p);
  }
  if (sourceId) {
    dist.set(sourceId, 0);
    const queue = [sourceId];
    while (queue.length > 0) {
      const u = queue.shift()!;
      const d = dist.get(u)!;
      for (const pipe of adj.get(u) ?? []) {
        if (dist.has(pipe.toNodeId)) continue;
        dist.set(pipe.toNodeId, d + pipe.length_m);
        queue.push(pipe.toNodeId);
      }
    }
  }

  /* === per-node write-back === */
  for (const nr of results.nodes) {
    const node = nodeById.get(nr.nodeId);
    if (!node) continue;
    node.result_p_pod_mpa = nr.pressureAtNode_mpa;
    // Convert MPa → m water column
    node.result_h_pod_m = (nr.pressureAtNode_mpa * 1e6) / (rho * GRAVITY);
    node.result_t_pod_c = schedule.supply_c;
    node.result_t_obr_c = schedule.return_c;
    node.result_dist_from_src_m = dist.get(nr.nodeId);
  }

  /* === per-pipe write-back === */
  for (const pr of results.pipes) {
    const pipe = pipes.find((p) => p.id === pr.pipeId);
    if (!pipe) continue;
    pipe.result_g_pod_kg_s = pr.G_kg_s;
    pipe.result_g_obr_kg_s = pr.G_kg_s;       // closed loop: same flow
    pipe.result_v_pod_m_s = pr.v_m_s;
    pipe.result_v_obr_m_s = pr.v_m_s;
    pipe.result_dp_pod_pa = pr.totalPressureDrop_pa;
    pipe.result_dp_obr_pa = pr.totalPressureDrop_pa;
    // Travel time (transit) — engineer expects this displayed
    const size = PIPE_DB[settings.primaryMaterialCategory].find((p) => p.dn === pipe.dn);
    if (size && pr.v_m_s > 0) {
      // Already aggregated; keep individual segments — no extra fields needed
    }
  }
}

/** For Excel/DXF/save export: the snapshot already includes all result_* fields after writeBack. */
