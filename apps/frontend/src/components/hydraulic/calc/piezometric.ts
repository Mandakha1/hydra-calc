/**
 * Piezometric profile — supply/return head trace along the longest path.
 *
 * Builds the head curve every engineer drafts on graph paper before
 * sizing the pump. Walks the source → worst-served-consumer path from
 * the existing topology helper, applies friction ΔP from the production
 * Darcy-Weisbach solver, and tags every node with the operating heads
 * + the spec-derived envelopes (P_max from pipe PN rating, P_min from
 * "fill the highest tap + air gap").
 *
 * Reference:
 *   - СП 124.13330.2012 §7.2-7.5  (piezometric diagram conventions)
 *   - BNbD 41-01-2019 §6.3-6.4    (consumer Δp ≥ 0.15 MPa rule = ≈15 m H₂O)
 *
 * Sign convention (looking at a typical Mongolian residential graph
 * supply-going-east, return-going-west on the diagram):
 *   - We walk source → consumer in the path order.
 *   - supply_head decreases by friction along each step (water moving
 *     downstream loses head to friction).
 *   - return_head increases by friction along each step in the WALK
 *     direction, because the return fluid is moving the OTHER way and
 *     experiences friction on its journey back — so the head visible at
 *     a consumer-side return tap is higher than the head visible at the
 *     source-side return inlet.
 *
 * Default constants below mirror the Mongolian residential design defaults
 * documented in the УБ ТЭЦ engineering standard. Caller can override.
 */
import { computePipeFlows } from "./hydraulics";
import { findLongestPath, pathToConsumer, pickAutoSource, type OrientedPipe } from "./topology";
import type { SchemeNode, SchemePipe, ProjectSettings } from "../hydraulicTypes";
import { WATER_PROPS, TEMP_SCHEDULES } from "shared";

const GRAVITY = 9.81;

/** Inputs for the piezometric profile computation. Everything except
 *  `nodes`, `pipes`, `settings` has a sensible default. */
export interface PiezometricInputs {
  nodes: SchemeNode[];
  pipes: SchemePipe[];
  settings: ProjectSettings;
  /** Source node id. If unset, the first source_* node is auto-picked. */
  sourceId?: string;
  /** Target consumer id. If unset, walk the longest path from the source. */
  consumerId?: string;
  /** Net pump head in metres of water column. Default 30 m. */
  pumpHeadM?: number;
  /** Expansion-tank elevation above the source datum (static-pressure
   *  reservoir). Default 50 m — typical УБ-system high-point. */
  staticPressureHeadM?: number;
  /** Pipe pressure-rating (PN) class in bar. Default PN 10 (residential). */
  systemPNRating?: 10 | 16 | 25;
  /** Ground elevation at the source in metres. Default 1269 (УБ avg). */
  sourceElevationM?: number;
  /** Per-consumer ground elevations. Missing entries fall back to
   *  `sourceElevationM`. */
  consumerElevationsM?: Record<string, number>;
  /** Per-consumer building height (metres) — used to compute the minimum
   *  required head at the consumer node ("fill the highest tap + air gap").
   *  Default 6 m for a typical 2-storey house. */
  buildingHeightsM?: Record<string, number>;
  /** Air-gap safety margin above the building height (m). Default 2 m. */
  airGapM?: number;
  /** Phase 5D.3 — optional per-node supply temperature (°C) populated
   *  by the heat-loss-enabled solver pass. When present, the profile
   *  carries a parallel `supplyTemp_C` track per point so the
   *  piezometric chart can overlay temperature alongside pressure. */
  supplyTempByNodeId?: Record<string, number> | Map<string, number>;
}

export interface PiezometricPoint {
  /** Cumulative distance from source along the path (m). */
  distanceFromSourceM: number;
  nodeId: string;
  nodeLabel: string;
  /** Ground elevation at this point (m). */
  groundHeadM: number;
  /** Head of the supply line at this point, in metres of water column. */
  supplyHeadM: number;
  /** Head of the return line at this point, in metres of water column. */
  returnHeadM: number;
  /** Static (no-pump-running) head — the level the expansion tank holds. */
  staticHeadM: number;
  /** Pressure-rating envelope: supply must stay BELOW this. */
  maxAllowedHeadM: number;
  /** Service envelope: supply must stay ABOVE this so the consumer's
   *  highest tap fills. */
  minRequiredHeadM: number;
  /** Available pressure difference at this node, supply − return (m H₂O). */
  availableDPM: number;
  /** Phase 5D.3 — supply temperature at this point (°C). Populated
   *  only when the caller passes `supplyTempByNodeId`. Undefined when
   *  heat-loss integration was disabled. */
  supplyTemp_C?: number;
}

export interface PiezometricViolation {
  pointId: string;
  rule: "supply_below_min" | "supply_above_max" | "available_dp_below_min";
  actual: number;
  limit: number;
  /** Human-readable Mongolian description. */
  message: string;
}

export interface PiezometricResult {
  /** Source node id used. */
  sourceId: string;
  /** Worst-served (target) consumer node id. */
  consumerId: string;
  /** Walked path: ordered points from source to consumer. */
  points: PiezometricPoint[];
  /** Pipes walked, in path order. */
  pipes: OrientedPipe[];
  /** Constraint violations along the path. Empty array = profile is OK. */
  violations: PiezometricViolation[];
  /** Total pump head consumed by friction in metres (round-trip on the
   *  supply-and-return loop, NOT one-way). */
  totalFrictionHeadM: number;
}

/**
 * Compute the piezometric profile along source → consumer.
 *
 * Pure function: no UI dependencies, deterministic given the inputs.
 * Throws if the graph has no source — caller should guard with
 * pickAutoSource() if they want auto-detection.
 */
export function computePiezometricProfile(inputs: PiezometricInputs): PiezometricResult {
  const {
    nodes,
    pipes,
    settings,
    pumpHeadM = 30,
    staticPressureHeadM = 50,
    systemPNRating = 10,
    sourceElevationM = 1269,
    consumerElevationsM = {},
    buildingHeightsM = {},
    airGapM = 2,
    supplyTempByNodeId,
  } = inputs;

  /** Normalise the optional supply-temp map: accept either Map or
   *  plain object. Empty object → no temp track. */
  const tempLookup: Map<string, number> | null = supplyTempByNodeId
    ? supplyTempByNodeId instanceof Map
      ? supplyTempByNodeId
      : new Map(Object.entries(supplyTempByNodeId))
    : null;

  // 1. Resolve source. If caller didn't pass one, pick an auto source.
  const source = inputs.sourceId
    ? nodes.find((n) => n.id === inputs.sourceId)
    : pickAutoSource(nodes);
  if (!source) {
    throw new Error("computePiezometricProfile: no source node found in graph");
  }

  // 2. Resolve path: if consumerId given, walk source→consumer; else
  //    take the longest path from source to whichever consumer is farthest.
  const path = inputs.consumerId
    ? pathToConsumer(nodes, pipes, source.id, inputs.consumerId)
    : findLongestPath(nodes, pipes, source.id);
  if (!path || path.pipes.length === 0) {
    throw new Error("computePiezometricProfile: no path found from source to any consumer");
  }
  const consumerId = path.nodeIds[path.nodeIds.length - 1]!;

  // 3. Look up friction ΔP per pipe from the production solver. We re-run
  //    it here rather than expecting pre-computed results — keeps this
  //    function stateless and decouples it from the editor's results
  //    flow (so it works on a freshly-imported network).
  const flowResults = computePipeFlows(nodes, pipes, settings);
  const dpByPipeId = new Map(flowResults.map((r) => [r.pipeId, r.totalPressureDrop_pa]));

  // 4. Water density at the average loop temperature (matches the solver).
  const schedule = TEMP_SCHEDULES.find((t) => t.key === settings.temperatureScheduleKey) ?? TEMP_SCHEDULES[0]!;
  const t_mean = (schedule.supply_c + schedule.return_c) / 2;
  const rho = waterDensityAt(t_mean);
  const PaToM = (pa: number) => pa / (rho * GRAVITY);

  // 5. Initial heads at source.
  const staticHeadM = sourceElevationM + staticPressureHeadM;
  const supplyInitM = staticHeadM + pumpHeadM / 2;
  const returnInitM = staticHeadM - pumpHeadM / 2;

  // 6. Walk the path.
  const points: PiezometricPoint[] = [];
  const violations: PiezometricViolation[] = [];
  const pnHeadM = systemPNRating * 10.2; // bar → m H₂O (1 bar ≈ 10.2 m)
  let cumDistM = 0;
  let supplyM = supplyInitM;
  let returnM = returnInitM;
  let totalFrictionHeadM = 0;

  const pushPoint = (nodeId: string, before = false) => {
    const node = nodes.find((n) => n.id === nodeId)!;
    const ground = consumerElevationsM[nodeId] ?? sourceElevationM;
    const bldgH = buildingHeightsM[nodeId] ?? 0;
    const maxAllowed = ground + pnHeadM;
    const minRequired = ground + bldgH + airGapM;
    const availDP = supplyM - returnM;

    const point: PiezometricPoint = {
      distanceFromSourceM: cumDistM,
      nodeId,
      nodeLabel: node.label,
      groundHeadM: ground,
      supplyHeadM: supplyM,
      returnHeadM: returnM,
      staticHeadM,
      maxAllowedHeadM: maxAllowed,
      minRequiredHeadM: minRequired,
      availableDPM: availDP,
      supplyTemp_C: tempLookup?.get(nodeId),
    };
    points.push(point);

    // Constraints — skip if this is the source itself (the source is
    // always "supplied", by definition, and its consumer-side rules
    // don't apply).
    if (!before && nodeId !== source.id) {
      if (supplyM > maxAllowed) {
        violations.push({
          pointId: nodeId,
          rule: "supply_above_max",
          actual: supplyM,
          limit: maxAllowed,
          message: `${node.label} дээр нийлүүлэх даралт PN${systemPNRating} хязгаараас давсан (${supplyM.toFixed(1)} > ${maxAllowed.toFixed(1)} м)`,
        });
      }
      if (supplyM < minRequired) {
        violations.push({
          pointId: nodeId,
          rule: "supply_below_min",
          actual: supplyM,
          limit: minRequired,
          message: `${node.label} дээр нийлүүлэх даралт дээд цэгийг хүрэхгүй (${supplyM.toFixed(1)} < ${minRequired.toFixed(1)} м)`,
        });
      }
      // BNbD 41-01 §6.3: Δp_consumer ≥ 0.15 MPa ≈ 15 m H₂O
      if (node.kind?.startsWith("consumer_") || node.kind === "consumer") {
        if (availDP < 15) {
          violations.push({
            pointId: nodeId,
            rule: "available_dp_below_min",
            actual: availDP,
            limit: 15,
            message: `${node.label} дээр ΔP=${availDP.toFixed(1)} м < 15 м (БНбД 41-01 §6.3)`,
          });
        }
      }
    }
  };

  // Source point first.
  pushPoint(source.id);

  // Each pipe step.
  for (let i = 0; i < path.pipes.length; i += 1) {
    const op = path.pipes[i]!;
    const nextNodeId = op.forward ? op.pipe.toNodeId : op.pipe.fromNodeId;
    const dp_pa = dpByPipeId.get(op.pipe.id) ?? 0;
    const dp_m = PaToM(dp_pa);
    cumDistM += op.pipe.length_m;
    supplyM -= dp_m;
    returnM += dp_m; // walking forward FROM source TO consumer along return ⇒ head rises
    totalFrictionHeadM += dp_m * 2; // round-trip
    pushPoint(nextNodeId);
  }

  return {
    sourceId: source.id,
    consumerId,
    points,
    pipes: path.pipes,
    violations,
    totalFrictionHeadM,
  };
}

/** Water density (kg/m³) at temperature t_c, with linear interpolation
 *  through the WATER_PROPS table. Replicated here (not exported from
 *  hydraulics.ts) so this module has no internal-circular dep. */
function waterDensityAt(t_c: number): number {
  const map = WATER_PROPS.density_kg_m3;
  const rounded = Math.round(t_c / 5) * 5;
  const key = `at_${rounded}c` as keyof typeof map;
  return map[key] ?? 972;
}
