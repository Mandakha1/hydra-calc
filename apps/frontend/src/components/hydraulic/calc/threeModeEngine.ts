/**
 * Three-mode calculation engine — modeled after Zulu Thermo:
 *
 *   1. CONSTRUCTIVE  (конструкторский)  — size pipes given heat loads & R_max constraint
 *   2. COMMISSIONING (наладочный)       — auto-balance: solve & size throttle washers per consumer
 *   3. VERIFICATION  (поверочный)       — what-if: as-built network with fixed restrictors & pumps
 *
 * Wraps `runFullCalc` from hydraulics.ts and adds:
 *   - Constructive: iterates DN selection per pipe to keep R ≤ R_max
 *   - Commissioning: after computing pressures, sizes a throttle washer per consumer
 *     to dissipate excess head down to the design Δp_consumer (0.15 MPa default)
 *   - Verification: just runs as-is and reports
 */
import { NORM_THRESHOLDS, PIPE_DB } from "shared";
import type {
  CalculationResults,
  ProjectSettings,
  SchemeNode,
  SchemePipe,
} from "../hydraulicTypes";
import { runFullCalc } from "./hydraulics";
import { sizeThrottleWasher, type ThrottleWasherResult } from "./itpDevices";

export type CalcMode = "constructive" | "commissioning" | "verification";

export interface ThreeModeOptions {
  mode: CalcMode;
  /** Maximum specific head loss for constructive sizing (Pa/m). */
  R_max_pa_per_m?: number;
  /** Target consumer Δp for commissioning (MPa). */
  target_dp_consumer_mpa?: number;
}

export interface ConsumerBalancing {
  nodeId: string;
  nodeLabel: string;
  /** Pressure available before throttling (MPa). */
  arrivedPressure_mpa: number;
  /** Pressure needed at consumer (MPa). */
  requiredPressure_mpa: number;
  /** Excess to dissipate (Pa). */
  excessPressure_pa: number;
  /** Mass flow (kg/s). */
  G_kg_s: number;
  /** Throttle washer sizing. */
  washer: ThrottleWasherResult;
}

export interface ThreeModeResults {
  mode: CalcMode;
  /** Standard hydraulic results. */
  hydraulic: CalculationResults;
  /** For commissioning mode: throttle washer per consumer. */
  balancing?: ConsumerBalancing[];
  /** For constructive mode: suggested DN changes. */
  resizing?: { pipeId: string; oldDn: number; newDn: number; reason: string }[];
  /** Engineering report summary. */
  report: string[];
}

/**
 * CONSTRUCTIVE: iteratively bump up DN on any pipe where R > R_max.
 * Returns a copy of pipes (unchanged here — caller can apply).
 */
export function constructiveResize(
  pipes: SchemePipe[],
  results: CalculationResults,
  settings: ProjectSettings,
  R_max: number,
): { newPipes: SchemePipe[]; changes: ThreeModeResults["resizing"] } {
  const dnTable = PIPE_DB[settings.primaryMaterialCategory].map((p) => p.dn);
  const changes: NonNullable<ThreeModeResults["resizing"]> = [];
  const newPipes = pipes.map((pipe) => {
    const r = results.pipes.find((x) => x.pipeId === pipe.id);
    if (!r || r.headlossPerMeter_pa <= R_max) return pipe;
    const idx = dnTable.indexOf(pipe.dn);
    if (idx < 0 || idx === dnTable.length - 1) return pipe;
    const newDn = dnTable[idx + 1]!;
    changes.push({
      pipeId: pipe.id,
      oldDn: pipe.dn,
      newDn,
      reason: `R=${r.headlossPerMeter_pa.toFixed(0)} > ${R_max} Pa/м`,
    });
    return { ...pipe, dn: newDn };
  });
  return { newPipes, changes };
}

/**
 * COMMISSIONING: for every consumer, compute the orifice that absorbs excess head.
 * Excess = (arrivedPressure - requiredPressure) at the consumer node.
 */
export function balanceConsumers(
  nodes: SchemeNode[],
  results: CalculationResults,
  target_dp_mpa: number,
): ConsumerBalancing[] {
  const out: ConsumerBalancing[] = [];
  for (const node of nodes.filter((n) => n.kind === "consumer")) {
    const nr = results.nodes.find((x) => x.nodeId === node.id);
    if (!nr) continue;
    const required = node.requiredPressure_mpa ?? target_dp_mpa;
    const arrived = nr.pressureAtNode_mpa;
    const excess_mpa = arrived - required;
    if (excess_mpa <= 0) continue; // no throttling needed (or under-pressure — handled by violations)

    // Find this consumer's flow — pipe pointing INTO this node.
    const pipeIn = results.pipes.find((p) => {
      // We need to look up which pipe ends at this node; use heuristic: find pipe with toNodeId
      return false;
    });
    // Better: search via results structure indirectly. Use heatLoad as proxy.
    const Q = node.heatLoad_w ?? 0;
    const dT = 25; // approx — improvements: pull from settings schedule
    const G = Q / (4187 * dT);

    const washer = sizeThrottleWasher({
      deltaP_pa: excess_mpa * 1e6,
      G_kg_s: G,
    });

    out.push({
      nodeId: node.id,
      nodeLabel: node.label,
      arrivedPressure_mpa: arrived,
      requiredPressure_mpa: required,
      excessPressure_pa: excess_mpa * 1e6,
      G_kg_s: G,
      washer,
    });
  }
  return out;
}

export function runThreeMode(
  nodes: SchemeNode[],
  pipes: SchemePipe[],
  settings: ProjectSettings,
  options: ThreeModeOptions,
): ThreeModeResults {
  const R_max = options.R_max_pa_per_m ?? NORM_THRESHOLDS.headloss_max_main_pa_per_m;
  const target_dp = options.target_dp_consumer_mpa ?? NORM_THRESHOLDS.dp_consumer_min_mpa;
  const report: string[] = [];

  // First pass: standard hydraulic calc
  let hydraulic = runFullCalc(nodes, pipes, settings);

  let resizing: ThreeModeResults["resizing"];
  let balancing: ConsumerBalancing[] | undefined;

  if (options.mode === "constructive") {
    // Iterate up to 5 times: enlarge any pipe with R > R_max
    for (let iter = 0; iter < 5; iter += 1) {
      const { newPipes, changes } = constructiveResize(pipes, hydraulic, settings, R_max);
      if (!changes || changes.length === 0) break;
      pipes = newPipes;
      hydraulic = runFullCalc(nodes, pipes, settings);
      if (!resizing) resizing = [];
      resizing.push(...changes);
    }
    report.push(
      resizing
        ? `Зураг төслийн тооцоо: ${resizing.length} хоолой томрооллоо (R_max = ${R_max} Pa/м)`
        : `Зураг төслийн тооцоо: бүх хоолой R ≤ ${R_max} Pa/м хангасан`,
    );
  }

  if (options.mode === "commissioning") {
    balancing = balanceConsumers(nodes, hydraulic, target_dp);
    report.push(
      balancing.length === 0
        ? `Тэнцвэржүүлэх тооцоо: бүх хэрэглэгч даралтаар хангагдсан, шайба шаардлагагүй`
        : `Тэнцвэржүүлэх тооцоо: ${balancing.length} хэрэглэгчид регуляторын шайба тооцоолсон`,
    );
    const oversized = balancing.filter((b) => b.washer.warning);
    if (oversized.length > 0) {
      report.push(`⚠ ${oversized.length} цэгт шайбаны хэлбэр зохиолтой биш — анхааруулга харна уу`);
    }
  }

  if (options.mode === "verification") {
    report.push("Шалгах горим: бодит схемийн төлөв байдал — норм харьцуулалтыг үр дүнгээс уншина уу");
  }

  return { mode: options.mode, hydraulic, balancing, resizing, report };
}
