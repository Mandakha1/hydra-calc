/**
 * Phase 6.6.2 — Construction line store-bridge.
 *
 * Applier pattern (continues from Phase 6.5.4 / 6.5.5 / 6.6.1): no
 * new methods on StoreActions. Reads/writes the store via
 * setState() + getState().
 *
 * Exposed:
 *   - addConstructionLine(line): inserts into store, snapshots for undo
 *   - updateConstructionLine(id, patch): partial update (no undo —
 *     same rationale as dimensions: slider/dropdown edits are too
 *     frequent for the undo stack; engineers expect them to "just
 *     stick")
 *   - removeConstructionLine(id): removes + scrubs selection refs +
 *     snapshots for undo
 *   - selectConstructionLine(id | null): convenience for the
 *     SchemeEditor click handler + the InspectorPanel
 */
import { useHydraulicStore } from "../hydraulicStore";
import type { SchemeConstructionLine } from "../hydraulicTypes";
import { pushUndoSnapshot } from "./undoStack";

/** Insert a fresh construction line into the store and snapshot for undo. */
export function addConstructionLine(line: SchemeConstructionLine): void {
  pushUndoSnapshot("Туслах шугам нэмсэн", 1);
  const cur = useHydraulicStore.getState();
  const existing = cur.constructionLines ?? [];
  useHydraulicStore.setState({
    constructionLines: [...existing, line],
  });
}

/** Patch an existing construction line. Used by the inspector
 *  (style dropdown, layer dropdown, label text). NOT snapshot-
 *  wrapped — small edits are too frequent for the undo stack;
 *  engineers expect them to "just stick". Destructive ops go via
 *  removeConstructionLine which IS snapshot-wrapped. */
export function updateConstructionLine(
  id: string,
  patch: Partial<SchemeConstructionLine>,
): void {
  const cur = useHydraulicStore.getState();
  const existing = cur.constructionLines ?? [];
  useHydraulicStore.setState({
    constructionLines: existing.map((c) => (c.id === id ? { ...c, ...patch } : c)),
  });
}

/** Remove a construction line, scrub through selection state,
 *  snapshot for undo. */
export function removeConstructionLine(id: string): void {
  pushUndoSnapshot("Туслах шугам устгасан", 1);
  const cur = useHydraulicStore.getState();
  const existing = cur.constructionLines ?? [];
  const ms = cur.multiSelection;
  useHydraulicStore.setState({
    constructionLines: existing.filter((c) => c.id !== id),
    multiSelection: {
      nodeIds: ms.nodeIds,
      pipeIds: ms.pipeIds,
      dimensionIds: ms.dimensionIds ?? [],
      constructionLineIds: (ms.constructionLineIds ?? []).filter((x) => x !== id),
    },
    selection: cur.selection?.id === id ? null : cur.selection,
  });
}

/** Convenience: single-select a construction line (mirrors the
 *  existing `select({kind:"node",id})` pattern but routed via the
 *  applier bridge for symmetry with dimensions). */
export function selectConstructionLine(id: string | null): void {
  if (id === null) {
    useHydraulicStore.getState().clearSelection();
    return;
  }
  useHydraulicStore.getState().select({ kind: "constructionLine", id });
}
