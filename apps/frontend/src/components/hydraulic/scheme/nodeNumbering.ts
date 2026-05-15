/**
 * Phase 12.8 — Engineering cross-reference node numbering.
 *
 * Assigns a sequential 1..N number to every node in the project for
 * use in:
 *   - The title-block legend (Phase 6.7.2)
 *   - The piezometric chart axis labels
 *   - BoM / report cross-reference tables
 *   - The plan view (small numeric badge next to each node)
 *
 * This number is SEPARATE from the engineer-set `node.label` (e.g.
 * "АОС-1", "УДДТ-1") — the label is human-meaningful but freely
 * editable; this number is auto-assigned and stable for cross-
 * referencing across reports.
 *
 * Ordering follows Mongolian engineering convention: SOURCES first
 * (УДДТ / Зуух), then JUNCTIONS, then CONSUMERS (АОС / АОЭ / АОБ),
 * then CHAMBERS (К / ҮХТ), then COMPENSATORS, then the rest. Within
 * each category, nodes are ordered by insertion (matches engineer's
 * drawing flow). The result is a deterministic Map<nodeId, number>.
 *
 * Pure module — no DOM, no React.
 */
import { getNodeKind } from "../nodeCatalog";
import type { SchemeNode } from "../hydraulicTypes";

/** Categorical priority for node numbering. Smaller = numbered earlier. */
const CATEGORY_PRIORITY: Record<string, number> = {
  source: 0,
  fitting: 1,    // generic junctions / tees / collectors (NodeCategory)
  consumer: 2,
  chamber: 3,
  valve: 4,
  pump: 5,
  sensor: 6,
};

/** Special-case priority for legacy bare kinds that have no nodeCatalog
 *  entry (Phase 5/6 schemas with `kind: "junction"` / `kind: "consumer"`).
 *  Treats them as their natural category so engineer cross-reference
 *  numbers stay sensible after migration. */
const LEGACY_KIND_PRIORITY: Record<string, number> = {
  source: 0,
  junction: 1,
  consumer: 2,
  pump: 5,
  well: 3,
};

function priorityOf(node: SchemeNode): number {
  const def = getNodeKind(node.kind);
  if (def) return CATEGORY_PRIORITY[def.category] ?? 99;
  const legacy = LEGACY_KIND_PRIORITY[node.kind];
  if (typeof legacy === "number") return legacy;
  return 99;
}

/**
 * Build the engineering-cross-reference number map. Returns a fresh
 * `Map<nodeId, number>` keyed by SchemeNode.id with 1-based sequential
 * numbers in Mongolian engineering category order.
 */
export function assignNodeNumbers(
  nodes: ReadonlyArray<SchemeNode>,
): Map<string, number> {
  // Stable category sort: nodes within the same category retain
  // insertion order. This means engineer adds АОС-1 then АОС-2 and
  // they get numbers in the same order.
  const indexed = nodes.map((n, i) => ({ node: n, originalIndex: i }));
  indexed.sort((a, b) => {
    const pa = priorityOf(a.node);
    const pb = priorityOf(b.node);
    if (pa !== pb) return pa - pb;
    return a.originalIndex - b.originalIndex;
  });
  const map = new Map<string, number>();
  indexed.forEach((entry, i) => {
    map.set(entry.node.id, i + 1);
  });
  return map;
}

/** Engineer-facing badge string. Pads single-digit numbers with a
 *  leading zero so badges line up neatly across the drawing
 *  (engineers reading at A3 scale benefit from this). */
export function nodeNumberBadge(num: number | undefined): string {
  if (num == null) return "";
  if (num < 10) return `0${num}`;
  return String(num);
}
