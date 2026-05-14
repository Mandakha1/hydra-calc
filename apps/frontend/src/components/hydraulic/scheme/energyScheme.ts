/**
 * Phase 8.2 — Energy schemes (pure helpers).
 *
 * Aggregates Phase 5 calc results into a heat-balance summary the
 * engineer can read in one glance: source output = distribution
 * losses + consumer loads. No NEW data-model fields required —
 * every number lives on `CalculationResults`.
 *
 * Standard references:
 *   - БНбД 41-01-2019 §5 — heat-load summation rule
 *   - СП 124.13330.2012 §6 — heat loss accounting on pipe network
 *   - ГОСТ 21.605 (Энергийн схем) — terminology for the Energy
 *     drawing sheet in the standard drawing set.
 *
 * Pure functions only — no DOM, no React. Unit-testable with
 * synthetic CalculationResults fixtures.
 */
import type {
  CalculationResults,
  NodeResult,
  PipeResult,
  SchemeNode,
  SchemePipe,
} from "../hydraulicTypes";
import { getNodeKind } from "../nodeCatalog";

/* ─── Per-consumer breakdown row ──────────────────────────────── */

export interface ConsumerLoadRow {
  /** Node id (matches SchemeNode.id). */
  nodeId: string;
  /** Engineer-facing label. */
  label: string;
  /** Node kind (consumer_apartment / consumer_school / …). */
  kind: string;
  /** Heat load in kW (from NodeResult.heatLoad_w / 1000). */
  load_kw: number;
  /** Supply temperature at the consumer inlet (°C). Optional —
   *  populated only when Phase 5D heat-loss integration ran. */
  supplyTemp_C?: number;
  /** Fraction of total consumer load (0..1). 0 when total is 0. */
  fractionOfTotal: number;
}

/* ─── Per-circuit pipe loss row ───────────────────────────────── */

export interface CircuitLossRow {
  /** Circuit key (`heating_supply`, `heating_return`, `dhw`, etc).
   *  Pipes without a circuit fall under `unknown`. */
  circuit: string;
  /** Total heat loss watts on this circuit. */
  loss_w: number;
  /** Total length of pipes carrying this circuit (m). */
  totalLength_m: number;
  /** Average heat loss per metre across this circuit's pipes. 0 when
   *  totalLength_m is 0. */
  avgLossPerMeter_W: number;
}

/* ─── Heat balance summary ────────────────────────────────────── */

export interface HeatBalance {
  /** Σ all consumer heat loads (kW). */
  totalConsumerLoad_kw: number;
  /** Σ pipe heat losses (kW). 0 when Phase 5D was disabled. */
  totalDistributionLoss_kw: number;
  /** Source output = consumer + losses (kW). The single bar the
   *  engineer cares about — drives source / boiler sizing. */
  sourceOutput_kw: number;
  /** Distribution loss as a fraction of source output (0..1). */
  lossFraction: number;
  /** Source supply temp (°C) — engineer-context for the warmest end. */
  sourceSupplyTemp_C?: number;
  /** Minimum consumer supply temp (°C) — coldest-end check. Triggers
   *  the БНбД 41-01-2019 §5.4 minimum-supply norm when below 80 °C. */
  minConsumerSupplyTemp_C?: number;
  /** Whether ALL consumers receive >= 80 °C (БНбД 41-01-2019 §5.4
   *  minimum). When false, the engineer should expect at least one
   *  RULE-T01 violation in the norm-check pass. */
  meetsMinSupplyTemp: boolean;
  /** Pump electrical power (kW). Engineer-relevant for energy
   *  efficiency reporting. */
  pumpPower_kw?: number;
}

/* ─── Full energy-scheme view model ───────────────────────────── */

export interface EnergyScheme {
  balance: HeatBalance;
  /** Per-consumer rows, sorted descending by load_kw. */
  consumers: ConsumerLoadRow[];
  /** Per-circuit pipe loss rows, sorted descending by loss_w. */
  circuitLosses: CircuitLossRow[];
}

/** Friendly error when calc results are missing. */
export interface EnergyError {
  error: string;
}

/**
 * Build the energy-scheme view model from the current store snapshot.
 *
 * Returns an error when `results` is undefined (engineer hasn't run
 * the solver yet) so the view layer can render a "Run Тооцоолох
 * first" advisory.
 */
export function buildEnergyScheme(
  nodes: SchemeNode[],
  pipes: SchemePipe[],
  results: CalculationResults | undefined,
): EnergyScheme | EnergyError {
  if (!results) {
    return {
      error: "Тооцооны үр дүн алга. Эхлээд ⚙ Тооцоолох товчийг дарж тооцоог гүйцэтгэнэ үү.",
    };
  }
  if (results.nodes.length === 0) {
    return { error: "Тооцооны үр дүнд зангилаа байхгүй байна." };
  }

  // Consumers — pull NodeResult rows where heatLoad_w > 0 (the only
  // entities that contribute to load).
  const consumerRows: ConsumerLoadRow[] = [];
  for (const nr of results.nodes) {
    if ((nr.heatLoad_w ?? 0) <= 0) continue;
    const n = nodes.find((x) => x.id === nr.nodeId);
    if (!n) continue;
    // Filter out sources from the consumer rows — heatLoad_w on a
    // source is the NEGATIVE of net production, not a load.
    const def = getNodeKind(n.kind);
    if (def?.category === "source") continue;
    consumerRows.push({
      nodeId: n.id,
      label: n.label,
      kind: n.kind,
      load_kw: nr.heatLoad_w / 1000,
      ...(typeof nr.supplyTemp_C_at_inlet === "number"
        ? { supplyTemp_C: nr.supplyTemp_C_at_inlet }
        : {}),
      fractionOfTotal: 0, // filled below
    });
  }

  const totalConsumerLoad_w = consumerRows.reduce((s, r) => s + r.load_kw * 1000, 0);
  for (const r of consumerRows) {
    r.fractionOfTotal = totalConsumerLoad_w > 0 ? (r.load_kw * 1000) / totalConsumerLoad_w : 0;
  }
  consumerRows.sort((a, b) => b.load_kw - a.load_kw);

  // Per-circuit pipe loss aggregation. Phase 5D adds heatLossPerMeter_W
  // to PipeResult; multiplying by pipe.length_m gives the segment loss.
  const circuitMap = new Map<string, { loss_w: number; totalLength_m: number }>();
  for (const pr of results.pipes) {
    const lossPerM = pr.heatLossPerMeter_W ?? 0;
    const pipe = pipes.find((p) => p.id === pr.pipeId);
    if (!pipe) continue;
    const circuit = pipe.circuit ?? "unknown";
    const lossSegment = lossPerM * pipe.length_m;
    const cur = circuitMap.get(circuit) ?? { loss_w: 0, totalLength_m: 0 };
    cur.loss_w += lossSegment;
    cur.totalLength_m += pipe.length_m;
    circuitMap.set(circuit, cur);
  }
  const circuitLosses: CircuitLossRow[] = [];
  for (const [circuit, agg] of circuitMap.entries()) {
    circuitLosses.push({
      circuit,
      loss_w: agg.loss_w,
      totalLength_m: agg.totalLength_m,
      avgLossPerMeter_W: agg.totalLength_m > 0 ? agg.loss_w / agg.totalLength_m : 0,
    });
  }
  circuitLosses.sort((a, b) => b.loss_w - a.loss_w);

  const totalDistributionLoss_w =
    typeof results.heatLoss?.totalHeatLoss_W === "number"
      ? results.heatLoss.totalHeatLoss_W
      : circuitLosses.reduce((s, r) => s + r.loss_w, 0);

  const sourceOutput_w = totalConsumerLoad_w + totalDistributionLoss_w;
  const minTemp = results.heatLoss?.minConsumerSupplyTemp_C;
  const sourceTemp = results.heatLoss?.sourceSupplyTemp_C;

  const balance: HeatBalance = {
    totalConsumerLoad_kw: totalConsumerLoad_w / 1000,
    totalDistributionLoss_kw: totalDistributionLoss_w / 1000,
    sourceOutput_kw: sourceOutput_w / 1000,
    lossFraction: sourceOutput_w > 0 ? totalDistributionLoss_w / sourceOutput_w : 0,
    ...(typeof sourceTemp === "number" ? { sourceSupplyTemp_C: sourceTemp } : {}),
    ...(typeof minTemp === "number" ? { minConsumerSupplyTemp_C: minTemp } : {}),
    // БНбД 41-01-2019 §5.4 minimum supply temp = 80 °C. When the
    // calc didn't run heat-loss integration, treat as PASS (engineer
    // sees the "no heat-loss data" banner separately).
    meetsMinSupplyTemp: typeof minTemp === "number" ? minTemp >= 80 : true,
    ...(typeof results.pump?.P_kW === "number" ? { pumpPower_kw: results.pump.P_kW } : {}),
  };

  return { balance, consumers: consumerRows, circuitLosses };
}

/* ─── Engineer-facing circuit labels ──────────────────────────── */

/**
 * Convert a circuit key into the Mongolian engineer-friendly label
 * used on the Energy view + БНбД-style drawings.
 */
export function circuitLabel(circuit: string): string {
  switch (circuit) {
    case "heating_supply":
      return "Халаалт нийлүүлэх (Т1)";
    case "heating_return":
      return "Халаалт буцах (Т2)";
    case "dhw_supply":
      return "Халуун ус (Т3)";
    case "dhw_return":
      return "ХУ буцах (Т4)";
    case "cold_water":
      return "Хүйтэн ус";
    case "unknown":
      return "Тодорхойгүй";
    default:
      return circuit;
  }
}

/**
 * Convert a node kind into a short Mongolian label for the consumer
 * table. Falls back to the kind string when unknown.
 */
export function consumerKindLabel(kind: string): string {
  const def = getNodeKind(kind);
  return def?.shortLabel ?? kind;
}

// Helper exports for tests that need a way to reference NodeResult /
// PipeResult shapes without re-importing from hydraulicTypes.
export type { NodeResult, PipeResult, CalculationResults };
