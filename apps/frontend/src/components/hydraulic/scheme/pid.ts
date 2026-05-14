/**
 * Phase 8.5 — УДДТ P&ID (pure helpers).
 *
 * Auto-layout for the УДДТ (heat-source) Process & Instrumentation
 * Diagram. Starts at the source node, walks the directed pipe graph,
 * groups elements by role (pump / valve / sensor / consumer), and
 * assigns each one a column index in a ladder-style diagram.
 *
 * The drawing convention follows the simplified ГОСТ 21.404 P&ID
 * standard adopted by Mongolian district-heating projects — circle
 * with a letter (P/T/F) for the instrument, gate symbol for the
 * valve, two-circle rotor for the pump.
 *
 * Pure functions only — no DOM. Unit-testable with synthetic node
 * fixtures.
 */
import { getNodeKind } from "../nodeCatalog";
import type { SchemeNode, SchemePipe } from "../hydraulicTypes";
import { buildDirectedAdjacency } from "../calc/topology";

/** Element role in the P&ID layout. */
export type PidRole =
  | "source"
  | "pump"
  | "valve"
  | "sensor"
  | "consumer"
  | "junction"
  | "chamber"
  | "fitting"
  | "other";

/** Single placed element in the ladder layout. */
export interface PidElement {
  nodeId: string;
  label: string;
  kind: string;
  role: PidRole;
  /** Column index (0 = source on the left, increases rightward). */
  column: number;
  /** Row offset within the column (0 = trunk, ±1 = above/below). */
  row: number;
  /** Short symbol code for ISA-style rendering (e.g. "P", "T", "F"
   *  for sensors; "P" pump body; "V" valve body). */
  symbol: string;
}

/** Edge between two placed elements (drawn as orthogonal pipe). */
export interface PidEdge {
  fromId: string;
  toId: string;
  circuit?: string;
}

/** Full P&ID view model. */
export interface PidLayout {
  elements: PidElement[];
  edges: PidEdge[];
  /** Pixel grid for the renderer. Each column lands at column * step
   *  + leftPad; each row lands at PadTop + row * vstep. */
  columns: number;
  /** Total number of rows used (max |row| across elements + 1). */
  rowSpan: number;
}

export interface PidError {
  error: string;
}

/** Map a node kind to a P&ID role. */
export function roleOf(kind: string): PidRole {
  if (kind.startsWith("source_")) return "source";
  if (kind.startsWith("pump_")) return "pump";
  if (kind.startsWith("valve_")) return "valve";
  if (kind.startsWith("sensor_")) return "sensor";
  if (kind.startsWith("consumer_")) return "consumer";
  if (kind === "chamber" || kind.startsWith("well_")) return "chamber";
  if (kind.startsWith("junction_") || kind === "tee" || kind === "reducer") return "junction";
  const def = getNodeKind(kind);
  if (def?.category === "fitting") return "fitting";
  return "other";
}

/** Short symbol code for ISA rendering. */
export function symbolFor(kind: string): string {
  if (kind === "sensor_pressure") return "P";
  if (kind === "sensor_temperature") return "T";
  if (kind === "sensor_flow") return "F";
  if (kind === "sensor_multipoint") return "MT";
  if (kind.startsWith("source_")) return "ЦТП";
  if (kind.startsWith("pump_")) return "N";
  if (kind.startsWith("valve_")) return "V";
  if (kind.startsWith("consumer_")) return "АОС";
  return getNodeKind(kind)?.shortLabel ?? "?";
}

/**
 * Build the P&ID layout. Walks the directed graph forward from
 * sources, assigning column indices via BFS distance.
 *
 * - column 0 = sources
 * - column N = nodes at BFS depth N from any source
 * - row 0 = trunk; sensors are drawn ABOVE the trunk (row -1) so
 *   they don't collide with the pipe path.
 */
export function buildPidLayout(
  nodes: SchemeNode[],
  pipes: SchemePipe[],
): PidLayout | PidError {
  if (nodes.length === 0) {
    return { error: "Сүлжээ хоосон. УДДТ P&ID гарагуй." };
  }
  const sources = nodes.filter((n) => roleOf(n.kind) === "source");
  if (sources.length === 0) {
    return {
      error: "Эх үүсвэр байхгүй. ЦТП / ТЭЦ / Котельная зангилаа нэмж энэ табыг ашиглана уу.",
    };
  }

  // BFS from each source — assign min-distance column.
  const adj = buildDirectedAdjacency(pipes);
  const columnOf = new Map<string, number>();
  const queue: string[] = [];
  for (const s of sources) {
    columnOf.set(s.id, 0);
    queue.push(s.id);
  }
  while (queue.length > 0) {
    const cur = queue.shift()!;
    const c = columnOf.get(cur)!;
    for (const p of adj.get(cur) ?? []) {
      if (!columnOf.has(p.toNodeId)) {
        columnOf.set(p.toNodeId, c + 1);
        queue.push(p.toNodeId);
      }
    }
  }

  // Sensors get row -1 (above trunk); everything else row 0.
  // Junctions / fittings in the middle of a path also stay on trunk.
  const elements: PidElement[] = [];
  let maxColumn = 0;
  for (const n of nodes) {
    const col = columnOf.get(n.id);
    if (col === undefined) continue; // disconnected from any source
    const role = roleOf(n.kind);
    elements.push({
      nodeId: n.id,
      label: n.label,
      kind: n.kind,
      role,
      column: col,
      row: role === "sensor" ? -1 : 0,
      symbol: symbolFor(n.kind),
    });
    if (col > maxColumn) maxColumn = col;
  }

  // Edges — only between elements that are both placed.
  const placedIds = new Set(elements.map((e) => e.nodeId));
  const edges: PidEdge[] = [];
  for (const p of pipes) {
    if (!placedIds.has(p.fromNodeId) || !placedIds.has(p.toNodeId)) continue;
    edges.push({
      fromId: p.fromNodeId,
      toId: p.toNodeId,
      ...(p.circuit ? { circuit: p.circuit } : {}),
    });
  }

  return {
    elements,
    edges,
    columns: maxColumn + 1,
    rowSpan: 2, // -1 (sensors) + 0 (trunk)
  };
}

/** Engineer-facing role label. */
export function roleLabel(role: PidRole): string {
  switch (role) {
    case "source":
      return "Эх үүсвэр";
    case "pump":
      return "Насос";
    case "valve":
      return "Арматура";
    case "sensor":
      return "Мэдрэгч";
    case "consumer":
      return "Хэрэглэгч";
    case "chamber":
      return "Камер";
    case "junction":
      return "Салаалалт";
    case "fitting":
      return "Холбоос";
    case "other":
      return "Бусад";
  }
}
