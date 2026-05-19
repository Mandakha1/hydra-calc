/**
 * Phase 12.1 — Outline-first entity workflow.
 *
 * Engineer draws building outline first, then right-clicks → "Энэ юу
 * вэ?" → picks an entity kind. The pure helpers here compute the
 * centroid of the outline (where the auto-created node lands) and
 * derive a sensible default label per kind.
 *
 * Real engineering convention (from GK-23/02 PDF reference):
 *   - Source: УДДТ-N or ЦТП-N
 *   - Consumer: АОС-N (residential), АОЭ-N (education), АОБ-N (industrial)
 *   - Well: ҮХТ-N, ДХ-N, К-N (different well/chamber types)
 *   - Compensator: ЭӨ-N (loop expansion)
 *
 * This module is pure — no React / DOM / store. The SchemeEditor
 * orchestration code consumes these helpers when wiring up the
 * right-click "Tag as..." action.
 */
import type { SchemeBuilding, SchemeNode } from "../hydraulicTypes";
import { getNodeKind } from "../nodeCatalog";

/**
 * Compute the centroid of a building's polygon. Used to place the
 * auto-created node when tagging. Returns scheme-pixel coords.
 *
 * Algorithm: signed-area centroid for closed polygons. Falls back
 * to the arithmetic mean when the polygon area is zero (degenerate
 * 2-vertex or collinear cases that the renderer shouldn't allow but
 * we handle defensively).
 */
export function buildingCentroid(building: SchemeBuilding): { x: number; y: number } {
  const pts = building.polygon;
  if (pts.length === 0) return { x: 0, y: 0 };
  if (pts.length === 1) return { x: pts[0]!.x, y: pts[0]!.y };
  // Signed-area centroid
  let cx = 0;
  let cy = 0;
  let signedArea = 0;
  for (let i = 0; i < pts.length; i += 1) {
    const j = (i + 1) % pts.length;
    const a = pts[i]!;
    const b = pts[j]!;
    const cross = a.x * b.y - b.x * a.y;
    signedArea += cross;
    cx += (a.x + b.x) * cross;
    cy += (a.y + b.y) * cross;
  }
  signedArea *= 0.5;
  if (Math.abs(signedArea) < 1e-6) {
    // Degenerate polygon — fall back to arithmetic mean
    let sx = 0;
    let sy = 0;
    for (const p of pts) {
      sx += p.x;
      sy += p.y;
    }
    return { x: sx / pts.length, y: sy / pts.length };
  }
  return {
    x: cx / (6 * signedArea),
    y: cy / (6 * signedArea),
  };
}

/**
 * Generate a default label for a newly-tagged building based on its
 * NodeKind. Engineering convention (Mongolian) per GK-23/02:
 *   - source_substation → "УДДТ-N" (substation)
 *   - source_boiler → "Зуух-N"
 *   - consumer_apartment → "АОС-N"
 *   - consumer_school → "АОЭ-N"
 *   - consumer_industrial → "АОБ-N"
 *   - well_supply → "ҮХТ-N"
 *   - chamber → "К-N"
 *   - compensator_u → "ЭӨ-N"
 *
 * Caller supplies the next number (counted from existing labels +1)
 * so we don't have a circular dep on the full state.
 */
export function defaultLabelForKind(kind: string, nextNumber: number): string {
  // Look up the kind in nodeCatalog for a sensible fallback prefix
  const def = getNodeKind(kind);
  // Mongolian-convention prefixes — match GK-23/02 PDF exactly
  if (kind === "source_substation") return `УДДТ-${nextNumber}`;
  if (kind === "source_boiler") return `Зуух-${nextNumber}`;
  // Phase 13.25 — generic source label per engineer rename
  // ("ТЭЦ" → "Эх үүсвэр"). source_factory kept for back-compat with
  // legacy projects but the engineer-facing label is now ЭҮ.
  if (kind === "source_factory") return `ЭҮ-${nextNumber}`;
  if (kind === "source_tec") return `ЭҮ-${nextNumber}`;
  if (kind === "consumer_apartment") return `АОС-${nextNumber}`;
  if (kind === "consumer_school") return `АОЭ-${nextNumber}`;
  if (kind === "consumer_industrial") return `АОБ-${nextNumber}`;
  if (kind === "consumer_warehouse") return `АОБ-${nextNumber}`;
  if (kind === "consumer") return `АОС-${nextNumber}`;
  if (kind === "well_supply") return `ҮХТ-${nextNumber}`;
  if (kind === "well_drain") return `ҮДТ-${nextNumber}`;
  if (kind === "chamber") return `К-${nextNumber}`;
  if (kind === "compensator_u") return `ЭӨ-${nextNumber}`;
  if (kind === "compensator_bellow") return `ЭӨ-${nextNumber}`;
  if (kind.startsWith("compensator")) return `ЭӨ-${nextNumber}`;
  if (kind === "pump_circ") return `Н-${nextNumber}`;
  // Fall back to short label from nodeCatalog
  return def?.shortLabel ? `${def.shortLabel}-${nextNumber}` : `?-${nextNumber}`;
}

/**
 * Count how many existing nodes share the same label prefix (used
 * to pick the next number). E.g. if "АОС-1", "АОС-2", "АОС-3"
 * exist, returns 3 → next default is "АОС-4".
 */
export function countExistingLabelPrefix(
  nodes: ReadonlyArray<SchemeNode>,
  kind: string,
): number {
  // Generate the prefix without the number — strip last "-N"
  const sample = defaultLabelForKind(kind, 0);
  const prefix = sample.slice(0, sample.lastIndexOf("-"));
  if (!prefix) return 0;
  let count = 0;
  for (const n of nodes) {
    if (n.label.startsWith(prefix + "-")) count += 1;
  }
  return count;
}

/**
 * Build the parameters needed to create a node when tagging a
 * building. Returns the node payload + the building update to apply.
 *
 * Caller:
 *   1. Calls this to get { node, buildingPatch }
 *   2. Stores the new node via addNode action
 *   3. Patches the building via updateBuilding action
 *
 * The two-step is enforced so undo/redo can capture both changes
 * as one batched op via the existing pushUndoSnapshot wrapper.
 */
export function buildTagAsParams(
  building: SchemeBuilding,
  kind: string,
  existingNodes: ReadonlyArray<SchemeNode>,
  idPrefix: string = "n",
): {
  node: Omit<SchemeNode, "id"> & { id: string };
  buildingPatch: Partial<SchemeBuilding>;
} {
  const centroid = buildingCentroid(building);
  const nextNum = countExistingLabelPrefix(existingNodes, kind) + 1;
  const label = building.label?.trim() || defaultLabelForKind(kind, nextNum);
  const nodeId = `${idPrefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  return {
    node: {
      id: nodeId,
      kind,
      label,
      x: centroid.x,
      y: centroid.y,
    },
    buildingPatch: {
      taggedAsKind: kind,
      taggedAsNodeId: nodeId,
      // Sync the building's label too — engineer typed it or we generated it.
      label,
    },
  };
}

/**
 * Engineer-facing "kinds I can tag as" list. Filters down to the
 * common Mongolian heating-design entity types. Phase 11 polish
 * could let the engineer toggle which kinds appear in the menu.
 */
export const TAG_AS_KIND_OPTIONS: ReadonlyArray<{
  kind: string;
  label: string;
  category: "source" | "consumer" | "chamber" | "fitting";
}> = [
  // Sources
  { kind: "source_substation", label: "🏭 УДДТ — Үндсэн дулааны дэд төв", category: "source" },
  { kind: "source_boiler", label: "🔥 Зуух", category: "source" },
  // Consumers
  { kind: "consumer_apartment", label: "🏠 Орон сууц (АОС)", category: "consumer" },
  { kind: "consumer_school", label: "🏫 Сургууль (АОЭ)", category: "consumer" },
  { kind: "consumer_industrial", label: "🏭 Үйлдвэр (АОБ)", category: "consumer" },
  // Wells / chambers
  { kind: "well_supply", label: "💧 Худаг (ҮХТ)", category: "chamber" },
  { kind: "chamber", label: "🛡 Камер (К)", category: "chamber" },
  // Compensators
  { kind: "compensator_u", label: "🔄 Компенсатор (ЭӨ)", category: "fitting" },
];
